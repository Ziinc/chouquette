//! The shim's C API (shim/shim.cc).

use std::ffi::{CStr, CString, c_char, c_void};
use std::path::Path;

use levain::levain_abi::{EventSink, HostApi};

#[repr(C)]
struct CqHost {
    ctx: *mut c_void,
    render: extern "C" fn(*mut c_void, u32, *const u8, usize),
    call: extern "C" fn(*mut c_void, *const u8, usize),
    check_components: extern "C" fn(*mut c_void, *const u8, usize) -> bool,
}

unsafe extern "C" {
    fn cq_node_new(host: *const CqHost) -> *mut c_void;
    fn cq_node_error() -> *const c_char;
    fn cq_node_run(
        handle: *mut c_void,
        entry: *const c_char,
        error: *mut c_char,
        len: usize,
    ) -> i32;
    fn cq_node_post(handle: *mut c_void, json: *const u8, len: usize);
    fn cq_node_stop(handle: *mut c_void);
}

/// One Node environment, wired to a host: run it on one thread, post events
/// and stop it from any.
pub struct Node {
    handle: *mut c_void,
}

// SAFETY: the shim's post and stop are thread-safe; run is called once, on
// the thread that owns the environment.
unsafe impl Send for Node {}
unsafe impl Sync for Node {}

impl Node {
    /// A runtime for `api`, whose events it receives from now on.
    pub fn new(api: &'static HostApi) -> Result<&'static Node, String> {
        let host = CqHost {
            ctx: api.ctx,
            render: api.render,
            call: api.call,
            check_components: api.check_components,
        };
        // SAFETY: the shim copies `host`.
        let handle = unsafe { cq_node_new(&host) };
        if handle.is_null() {
            // SAFETY: a static string the shim keeps.
            let why = unsafe { CStr::from_ptr(cq_node_error()) }
                .to_string_lossy()
                .into_owned();
            return Err(format!("Node failed to start: {why}"));
        }
        // The host keeps the sink for as long as the process runs.
        let node: &'static Node = Box::leak(Box::new(Node { handle }));
        (api.set_event_sink)(
            api.ctx,
            EventSink {
                ctx: (node as *const Node).cast_mut().cast(),
                call: on_event,
            },
        );
        Ok(node)
    }

    /// Runs the CommonJS app at `entry` on this thread until [`Node::stop`].
    pub fn run(&self, entry: &Path) -> Result<(), String> {
        let entry = CString::new(entry.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        let mut error = vec![0 as c_char; 4096];
        // SAFETY: `error` is writable for its length.
        let code =
            unsafe { cq_node_run(self.handle, entry.as_ptr(), error.as_mut_ptr(), error.len()) };
        if code == 0 {
            return Ok(());
        }
        // SAFETY: the shim NUL-terminates what it writes.
        let why = unsafe { CStr::from_ptr(error.as_ptr()) }
            .to_string_lossy()
            .into_owned();
        Err(if why.is_empty() {
            format!("the app exited with {code}")
        } else {
            why
        })
    }

    /// Hands a host event to the app.
    pub fn post(&self, json: &[u8]) {
        // SAFETY: valid for its length; the shim copies it.
        unsafe { cq_node_post(self.handle, json.as_ptr(), json.len()) }
    }

    /// Ends the app's event loop.
    pub fn stop(&self) {
        // SAFETY: thread-safe in the shim.
        unsafe { cq_node_stop(self.handle) }
    }
}

extern "C" fn on_event(ctx: *mut c_void, json: *const u8, len: usize) {
    // SAFETY: `ctx` is the leaked `Node`; the host passes a buffer valid for
    // `len` bytes for this call.
    let (node, json) = unsafe { (&*ctx.cast::<Node>(), std::slice::from_raw_parts(json, len)) };
    node.post(json);
}
