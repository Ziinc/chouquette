//! One QuickJS context running an app, and its event loop: host events,
//! timers and promise jobs, all on the thread that owns it.

use std::ffi::c_void;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::time::Duration;

use levain::levain_abi::{EventSink, HostApi};
use rquickjs::{CatchResultExt, Context, Function, Module, Runtime, WriteOptions};

const PRELUDE: &str = include_str!("prelude.js");
const WEB: &str = include_str!("web.js");

pub struct Engine {
    runtime: Runtime,
    context: Context,
    events: Receiver<Vec<u8>>,
}

impl Engine {
    /// A context wired to `api`: `__chouquette_host.send` renders, and the
    /// host's events reach `__chouquette_host.onEvent` listeners.
    pub fn new(api: &'static HostApi) -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        let (tx, events) = channel();
        let fetches = tx.clone();
        // The host keeps the sink for as long as the process runs.
        let ctx = Box::into_raw(Box::new(tx)).cast::<c_void>();
        (api.set_event_sink)(
            api.ctx,
            EventSink {
                ctx,
                call: on_event,
            },
        );

        context.with(|ctx| {
            let globals = ctx.globals();
            let render = Function::new(ctx.clone(), move |window: u32, json: String| {
                (api.render)(api.ctx, window, json.as_ptr(), json.len());
            });
            let call = Function::new(ctx.clone(), move |json: String| {
                (api.call)(api.ctx, json.as_ptr(), json.len());
            });
            let check = Function::new(ctx.clone(), move |json: String| -> bool {
                (api.check_components)(api.ctx, json.as_ptr(), json.len())
            });
            let log = Function::new(ctx.clone(), |line: String| levain::log_line(&line));
            globals
                .set("__chouquette_render", render)
                .catch(&ctx)
                .map_err(|e| e.to_string())?;
            globals
                .set("__chouquette_call", call)
                .catch(&ctx)
                .map_err(|e| e.to_string())?;
            globals
                .set("__chouquette_check_components", check)
                .catch(&ctx)
                .map_err(|e| e.to_string())?;
            globals
                .set("__chouquette_log", log)
                .catch(&ctx)
                .map_err(|e| e.to_string())?;
            let url = Function::new(ctx.clone(), crate::web::url);
            let random = Function::new(ctx.clone(), crate::web::random);
            let fetch = Function::new(
                ctx.clone(),
                move |id: f64,
                      method: String,
                      url: String,
                      headers: String,
                      body: Option<String>| {
                    crate::web::fetch(fetches.clone(), id, method, url, headers, body);
                },
            );
            for (name, f) in [
                ("__chouquette_url", url),
                ("__chouquette_random", random),
                ("__chouquette_fetch", fetch),
            ] {
                globals
                    .set(name, f)
                    .catch(&ctx)
                    .map_err(|e| e.to_string())?;
            }
            ctx.eval::<(), _>(PRELUDE)
                .catch(&ctx)
                .map_err(|e| format!("prelude: {e}"))?;
            ctx.eval::<(), _>(WEB)
                .catch(&ctx)
                .map_err(|e| format!("web.js: {e}"))
        })?;
        Ok(Self {
            runtime,
            context,
            events,
        })
    }

    /// Runs `source` (a script, as `chouquette build` bundles it).
    pub fn eval(&mut self, source: &str) -> Result<(), String> {
        self.context.with(|ctx| {
            ctx.eval::<(), _>(source)
                .catch(&ctx)
                .map_err(|e| e.to_string())
        })?;
        self.jobs();
        Ok(())
    }

    /// Runs an app compiled by [`compile`].
    pub fn eval_bytecode(&mut self, bytecode: &[u8]) -> Result<(), String> {
        self.context.with(|ctx| {
            // SAFETY: the bytes come from `compile`, by this same QuickJS:
            // `chouquette build` compiles with the host it ships.
            let module = unsafe { Module::load(ctx.clone(), bytecode) }
                .catch(&ctx)
                .map_err(|e| e.to_string())?;
            let (_, done) = module.eval().catch(&ctx).map_err(|e| e.to_string())?;
            done.finish::<()>().catch(&ctx).map_err(|e| e.to_string())
        })?;
        self.jobs();
        Ok(())
    }

    /// Runs `code`: bytecode or a script.
    pub fn load(&mut self, code: &crate::Code) -> Result<(), String> {
        match code {
            crate::Code::Bytecode(bytes) => self.eval_bytecode(bytes),
            crate::Code::Script(source) => self.eval(source),
        }
    }

    /// Runs `code`, then handles events and timers for as long as the host runs.
    pub fn run(&mut self, code: &crate::Code) -> Result<(), String> {
        self.load(code)?;
        loop {
            self.turn(None);
        }
    }

    /// Runs due timers, then waits up to `wait` (forever with `None`, but no
    /// longer than the next timer) for one host event and dispatches it.
    /// Returns whether an event arrived.
    pub fn turn(&mut self, wait: Option<Duration>) -> bool {
        let next = self.timers();
        let wait = match (wait, next) {
            (Some(w), Some(n)) => Some(w.min(n)),
            (w, n) => w.or(n),
        };
        let event = match wait {
            Some(wait) => self
                .events
                .recv_timeout(wait)
                .map_err(|e| e == RecvTimeoutError::Disconnected),
            None => self.events.recv().map_err(|_| true),
        };
        match event {
            Ok(json) => {
                self.dispatch(&json);
                self.timers();
                true
            }
            Err(_) => {
                self.timers();
                false
            }
        }
    }

    fn dispatch(&mut self, json: &[u8]) {
        let json = String::from_utf8_lossy(json).into_owned();
        self.context.with(|ctx| {
            let result = ctx
                .globals()
                .get::<_, Function>("__chouquette_dispatch")
                .and_then(|f| f.call::<_, ()>((json,)))
                .catch(&ctx);
            if let Err(error) = result {
                levain::log_line(&format!("chouquette: {error}"));
            }
        });
        self.jobs();
    }

    /// Runs due timers and promise jobs; how long until the next timer.
    fn timers(&mut self) -> Option<Duration> {
        self.jobs();
        let next = self.context.with(|ctx| {
            ctx.globals()
                .get::<_, Function>("__chouquette_timers")
                .and_then(|f| f.call::<_, f64>(()))
                .unwrap_or(-1.0)
        });
        self.jobs();
        (next >= 0.0).then(|| Duration::from_millis(next as u64))
    }

    fn jobs(&mut self) {
        while self.runtime.is_job_pending() {
            if let Err(error) = self.runtime.execute_pending_job() {
                levain::log_line(&format!("chouquette: {error}"));
            }
        }
    }
}

/// QuickJS bytecode for an app's script, which [`Engine::eval_bytecode`]
/// runs: no parsing at startup. It runs as a module (strict mode).
pub fn compile(source: &str) -> Result<Vec<u8>, String> {
    let runtime = Runtime::new().map_err(|e| e.to_string())?;
    let context = Context::full(&runtime).map_err(|e| e.to_string())?;
    context.with(|ctx| {
        Module::declare(ctx.clone(), "app.js", source)
            .and_then(|module| {
                // No source text: errors keep their line numbers.
                module.write(WriteOptions {
                    strip_source: true,
                    ..WriteOptions::default()
                })
            })
            .catch(&ctx)
            .map_err(|e| e.to_string())
    })
}

/// The host's event sink: hands each event to the JS thread.
extern "C" fn on_event(ctx: *mut c_void, json: *const u8, len: usize) {
    // SAFETY: `ctx` is the `Sender` leaked in `Engine::new`; the host passes
    // a buffer valid for `len` bytes for this call.
    let (tx, json) = unsafe {
        (
            &*ctx.cast::<Sender<Vec<u8>>>(),
            std::slice::from_raw_parts(json, len),
        )
    };
    let _ = tx.send(json.to_vec());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake_host::FakeHost;

    const NOW: Option<Duration> = Some(Duration::ZERO);

    #[test]
    fn send_renders_through_the_host_api() {
        let (api, host) = FakeHost::api();
        let mut engine = Engine::new(api).unwrap();
        engine
            .eval(r#"__chouquette_host.send(2, '{"root":"hi"}')"#)
            .unwrap();
        assert_eq!(host.take(), [(2, r#"{"root":"hi"}"#.into())]);
    }

    #[test]
    fn calls_go_through_the_host_api() {
        let (api, host) = FakeHost::api();
        let mut engine = Engine::new(api).unwrap();
        engine
            .eval(r#"__chouquette_host.call('{"call":"clipboard.read","ref":1,"args":{}}')"#)
            .unwrap();
        assert_eq!(
            *host.calls.lock().unwrap(),
            [r#"{"call":"clipboard.read","ref":1,"args":{}}"#]
        );
    }

    #[test]
    fn component_sets_are_checked_by_the_host() {
        let (api, host) = FakeHost::api();
        *host.components.lock().unwrap() = r#"{"gpui-kit":"aaaa"}"#.into();
        let mut engine = Engine::new(api).unwrap();
        engine
            .eval(
                r#"__chouquette_host.send(0, String(__chouquette_host.checkComponents('{"gpui-kit":"aaaa"}')));
                   __chouquette_host.send(0, String(__chouquette_host.checkComponents('{"gpui-kit":"bbbb"}')));"#,
            )
            .unwrap();
        assert_eq!(host.take(), [(0, "true".into()), (0, "false".into())]);
    }

    #[test]
    fn bytecode_runs_as_its_source_does() {
        let bytecode = crate::compile("__chouquette_host.send(3, 'from bytecode')").unwrap();
        let (api, host) = FakeHost::api();
        let mut engine = Engine::new(api).unwrap();
        engine.eval_bytecode(&bytecode).unwrap();
        assert_eq!(host.take(), [(3, "from bytecode".into())]);
    }

    #[test]
    fn a_compile_error_is_reported() {
        let error = crate::compile("let = ;").unwrap_err();
        assert!(error.contains("app.js:1"), "{error}");
    }

    #[test]
    fn host_events_reach_listeners() {
        let (api, host) = FakeHost::api();
        let mut engine = Engine::new(api).unwrap();
        engine
            .eval("__chouquette_host.onEvent(e => __chouquette_host.send(e.window, e.type + ':' + e.event))")
            .unwrap();
        host.send(levain::events::input(
            "click",
            1,
            "h2",
            serde_json::json!({}),
        ));
        assert!(engine.turn(NOW));
        assert_eq!(host.take(), [(1, "click:h2".into())]);
    }

    #[test]
    fn timers_and_promise_jobs_run() {
        let (api, host) = FakeHost::api();
        let mut engine = Engine::new(api).unwrap();
        engine
            .eval(
                "Promise.resolve().then(() => __chouquette_host.send(0, 'job'));
                 setTimeout(() => __chouquette_host.send(0, 'timer'), 0);
                 const id = setTimeout(() => __chouquette_host.send(0, 'cleared'), 0);
                 clearTimeout(id);",
            )
            .unwrap();
        assert!(!engine.turn(NOW));
        assert_eq!(host.take(), [(0, "job".into()), (0, "timer".into())]);
    }

    #[test]
    fn a_throwing_listener_does_not_stop_the_loop() {
        let (api, host) = FakeHost::api();
        let mut engine = Engine::new(api).unwrap();
        engine
            .eval(
                "__chouquette_host.onEvent(() => { throw new Error('boom') });
                 __chouquette_host.onEvent(e => __chouquette_host.send(0, e.type));",
            )
            .unwrap();
        host.send(levain::events::resync(0));
        assert!(engine.turn(NOW));
        assert_eq!(host.take(), [(0, "resync".into())]);
    }

    #[test]
    fn a_script_error_is_reported() {
        let (api, _host) = FakeHost::api();
        let error = Engine::new(api).unwrap().eval("nope()").unwrap_err();
        assert!(error.contains("nope"), "{error}");
    }
}
