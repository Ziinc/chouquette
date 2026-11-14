//! A host for tests: records renders and keeps the event sink, behind the
//! same C ABI as levain's.

use std::ffi::c_void;
use std::sync::Mutex;

use levain::levain_abi::{EventSink, HostApi};

/// A host that records renders and keeps the event sink.
#[derive(Default)]
pub struct FakeHost {
    pub renders: Mutex<Vec<(u32, String)>>,
    sink: Mutex<Option<EventSink>>,
}

impl FakeHost {
    pub fn api() -> (&'static HostApi, &'static FakeHost) {
        let host: &'static FakeHost = Box::leak(Box::default());
        let api = Box::leak(Box::new(HostApi {
            abi_version: levain::levain_abi::ABI_VERSION,
            ctx: (host as *const FakeHost).cast_mut().cast(),
            render,
            set_event_sink,
            check_components,
            call,
        }));
        (api, host)
    }

    /// Sends an event as the host's UI thread does.
    pub fn send(&self, event: serde_json::Value) {
        let sink = self.sink.lock().unwrap().expect("no event sink");
        let json = event.to_string();
        (sink.call)(sink.ctx, json.as_ptr(), json.len());
    }

    pub fn take(&self) -> Vec<(u32, String)> {
        std::mem::take(&mut self.renders.lock().unwrap())
    }
}

fn host(ctx: *mut c_void) -> &'static FakeHost {
    // SAFETY: `ctx` is the leaked `FakeHost` from `FakeHost::api`.
    unsafe { &*ctx.cast::<FakeHost>() }
}

extern "C" fn render(ctx: *mut c_void, window: u32, json: *const u8, len: usize) {
    // SAFETY: valid for `len` bytes for this call.
    let json = unsafe { std::slice::from_raw_parts(json, len) };
    host(ctx)
        .renders
        .lock()
        .unwrap()
        .push((window, String::from_utf8(json.to_vec()).unwrap()));
}
extern "C" fn set_event_sink(ctx: *mut c_void, sink: EventSink) {
    *host(ctx).sink.lock().unwrap() = Some(sink);
}
extern "C" fn check_components(_: *mut c_void, _: *const u8, _: usize) -> bool {
    true
}
extern "C" fn call(_: *mut c_void, _: *const u8, _: usize) {}
