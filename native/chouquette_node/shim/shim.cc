// The embedded Node runtime's C++ half: one Node environment on the calling
// thread, with a `chouquette` binding that renders and calls through the
// host, and a queue the host's events wake the loop through.
#include <deque>
#include <mutex>
#include <string>
#include <vector>

#include "node.h"
#include "uv.h"

extern "C" {
typedef void (*cq_render_fn)(void* ctx, uint32_t window, const char* json, size_t len);
typedef void (*cq_bytes_fn)(void* ctx, const char* json, size_t len);
typedef bool (*cq_check_fn)(void* ctx, const char* json, size_t len);

/// What the host gives the runtime: levain's HostApi, flattened.
typedef struct {
  void* ctx;
  cq_render_fn render;
  cq_bytes_fn call;
  cq_check_fn check_components;
} cq_host;
}

namespace {

using v8::Context;
using v8::External;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Global;
using v8::HandleScope;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;

std::once_flag process_once;
std::unique_ptr<node::MultiIsolatePlatform> platform;
std::string process_error;

struct Runtime {
  cq_host host;
  uv_async_t wake;
  std::mutex lock;
  std::deque<std::string> queue;
  bool stopping = false;
  Isolate* isolate = nullptr;
  node::Environment* env = nullptr;
  Global<Function> dispatch;
};

std::string utf8(Isolate* isolate, Local<Value> value) {
  String::Utf8Value s(isolate, value);
  return *s ? std::string(*s, s.length()) : std::string();
}

Runtime* self(const FunctionCallbackInfo<Value>& args) {
  return static_cast<Runtime*>(args.Data().As<External>()->Value());
}

void Render(const FunctionCallbackInfo<Value>& args) {
  Runtime* rt = self(args);
  uint32_t window = args[0]->Uint32Value(args.GetIsolate()->GetCurrentContext()).FromMaybe(0);
  std::string json = utf8(args.GetIsolate(), args[1]);
  rt->host.render(rt->host.ctx, window, json.data(), json.size());
}

void Call(const FunctionCallbackInfo<Value>& args) {
  Runtime* rt = self(args);
  std::string json = utf8(args.GetIsolate(), args[0]);
  rt->host.call(rt->host.ctx, json.data(), json.size());
}

void CheckComponents(const FunctionCallbackInfo<Value>& args) {
  Runtime* rt = self(args);
  std::string json = utf8(args.GetIsolate(), args[0]);
  args.GetReturnValue().Set(rt->host.check_components(rt->host.ctx, json.data(), json.size()));
}

void SetDispatch(const FunctionCallbackInfo<Value>& args) {
  if (args[0]->IsFunction()) self(args)->dispatch.Reset(args.GetIsolate(), args[0].As<Function>());
}

void Binding(Local<Object> exports, Local<Value>, Local<Context> context, void* priv) {
  Isolate* isolate = Isolate::GetCurrent();
  Local<External> data = External::New(isolate, priv);
  auto set = [&](const char* name, v8::FunctionCallback fn) {
    Local<Function> f = FunctionTemplate::New(isolate, fn, data)->GetFunction(context).ToLocalChecked();
    exports->Set(context, String::NewFromUtf8(isolate, name).ToLocalChecked(), f).Check();
  };
  set("render", Render);
  set("call", Call);
  set("checkComponents", CheckComponents);
  set("setDispatch", SetDispatch);
}

// The host's events, on the loop's thread: each goes to the JS dispatcher
// as a callback, so promise jobs and process.nextTick run after it.
void Drain(uv_async_t* handle) {
  Runtime* rt = static_cast<Runtime*>(handle->data);
  std::deque<std::string> events;
  bool stopping;
  {
    std::lock_guard<std::mutex> guard(rt->lock);
    events.swap(rt->queue);
    stopping = rt->stopping;
  }
  if (stopping) {
    node::Stop(rt->env);
    return;
  }
  if (rt->dispatch.IsEmpty()) return;
  HandleScope scope(rt->isolate);
  Local<Context> context = rt->isolate->GetCurrentContext();
  Local<Function> dispatch = rt->dispatch.Get(rt->isolate);
  for (const std::string& json : events) {
    Local<Value> arg = String::NewFromUtf8(rt->isolate, json.data(), v8::NewStringType::kNormal, json.size()).ToLocalChecked();
    node::MakeCallback(rt->isolate, context->Global(), dispatch, 1, &arg, {0, 0});
  }
}

// Sets up the host object apps render through, then runs the app.
const char* kBootstrap = R"JS(
const binding = process._linkedBinding("chouquette");
const listeners = [];
globalThis.__chouquette_host = {
  send: (window, json) => binding.render(window, json),
  call: json => binding.call(json),
  checkComponents: json => binding.checkComponents(json),
  onEvent: listener => void listeners.push(listener),
};
binding.setDispatch(json => {
  const event = JSON.parse(json);
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error(error);
    }
  }
});
const entry = process.argv[1];
require("node:module").createRequire(entry)(entry);
)JS";

}  // namespace

extern "C" {

/// A runtime for `host`; null if Node could not be set up in this process
/// (`cq_node_error` says why).
void* cq_node_new(const cq_host* host) {
  std::call_once(process_once, [] {
    auto result = node::InitializeOncePerProcess(
        {"chouquette"},
        {node::ProcessInitializationFlags::kNoInitializeV8, node::ProcessInitializationFlags::kNoInitializeNodeV8Platform,
         node::ProcessInitializationFlags::kNoDefaultSignalHandling, node::ProcessInitializationFlags::kNoStdioInitialization,
         node::ProcessInitializationFlags::kNoPrintHelpOrVersionOutput});
    for (const std::string& e : result->errors()) process_error += e + "\n";
    if (result->early_return()) return;
    platform = node::MultiIsolatePlatform::Create(4);
    v8::V8::InitializePlatform(platform.get());
    v8::V8::Initialize();
  });
  if (!platform) return nullptr;
  auto* rt = new Runtime();
  rt->host = *host;
  return rt;
}

const char* cq_node_error() { return process_error.c_str(); }

/// Runs the app at `entry` (a CommonJS file) on this thread until
/// `cq_node_stop`. Returns 0, or 1 with `error` filled in.
int cq_node_run(void* handle, const char* entry, char* error, size_t error_len) {
  Runtime* rt = static_cast<Runtime*>(handle);
  std::vector<std::string> errors;
  std::vector<std::string> args = {"chouquette", entry};
  auto setup = node::CommonEnvironmentSetup::Create(platform.get(), &errors, args, std::vector<std::string>{});
  if (!setup) {
    std::string all;
    for (const std::string& e : errors) all += e + "\n";
    snprintf(error, error_len, "%s", all.c_str());
    return 1;
  }
  Isolate* isolate = setup->isolate();
  int code = 0;
  {
    v8::Locker locker(isolate);
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);
    Context::Scope context_scope(setup->context());
    rt->isolate = isolate;
    uv_async_init(setup->event_loop(), &rt->wake, Drain);
    rt->wake.data = rt;
    node::AddLinkedBinding(setup->env(), "chouquette", Binding, rt);
    v8::TryCatch try_catch(isolate);
    if (node::LoadEnvironment(setup->env(), kBootstrap).IsEmpty() && try_catch.HasCaught()) {
      snprintf(error, error_len, "%s", utf8(isolate, try_catch.Exception()).c_str());
      code = 1;
    }
    // Events posted before the app set up its dispatcher wait until now.
    {
      std::lock_guard<std::mutex> guard(rt->lock);
      rt->env = setup->env();
      if (!rt->queue.empty() || rt->stopping) uv_async_send(&rt->wake);
    }
    if (code == 0) code = node::SpinEventLoop(setup->env()).FromMaybe(1);
    rt->dispatch.Reset();
    uv_close(reinterpret_cast<uv_handle_t*>(&rt->wake), nullptr);
    uv_run(setup->event_loop(), UV_RUN_NOWAIT);
    std::lock_guard<std::mutex> guard(rt->lock);
    rt->env = nullptr;
  }
  return code;
}

/// Queues a host event for the app; any thread.
void cq_node_post(void* handle, const char* json, size_t len) {
  Runtime* rt = static_cast<Runtime*>(handle);
  std::lock_guard<std::mutex> guard(rt->lock);
  rt->queue.emplace_back(json, len);
  if (rt->env) uv_async_send(&rt->wake);
}

/// Ends the app's loop; `cq_node_run` returns. Any thread.
void cq_node_stop(void* handle) {
  Runtime* rt = static_cast<Runtime*>(handle);
  std::lock_guard<std::mutex> guard(rt->lock);
  rt->stopping = true;
  if (rt->env) uv_async_send(&rt->wake);
}

}  // extern "C"
