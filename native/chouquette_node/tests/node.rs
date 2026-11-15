//! The embedded Node runtime against a fake host. Needs libnode
//! (`CHOUQUETTE_LIBNODE`); without it there is nothing to test.
#![cfg(chouquette_libnode)]

use std::time::{Duration, Instant};

use chouquette_node::Node;

#[allow(dead_code)]
mod fake_host;
use fake_host::FakeHost;

/// Runs `script` as the app; returns the host, the runtime and its thread.
fn start(
    script: &str,
) -> (
    &'static FakeHost,
    &'static Node,
    std::thread::JoinHandle<Result<(), String>>,
    tempfile::TempDir,
) {
    let dir = tempfile::tempdir().unwrap();
    let entry = dir.path().join("app.js");
    std::fs::write(&entry, script).unwrap();
    let (api, host) = FakeHost::api();
    let node = Node::new(api).unwrap();
    let thread = std::thread::spawn(move || node.run(&entry));
    (host, node, thread, dir)
}

fn renders(host: &FakeHost, n: usize) -> Vec<(u32, String)> {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut out = Vec::new();
    while out.len() < n && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
        out.extend(host.take());
    }
    out
}

#[test]
fn renders_and_calls_through_the_host_api() {
    let (host, node, thread, _dir) = start(
        r#"__chouquette_host.send(2, '{"root":"hi"}');
           __chouquette_host.call('{"call":"clipboard.read","ref":1,"args":{}}');"#,
    );
    assert_eq!(renders(host, 1), [(2, r#"{"root":"hi"}"#.into())]);
    assert_eq!(
        *host.calls.lock().unwrap(),
        [r#"{"call":"clipboard.read","ref":1,"args":{}}"#]
    );
    node.stop();
    assert_eq!(thread.join().unwrap(), Ok(()));
}

#[test]
fn host_events_reach_listeners_with_node_apis_at_hand() {
    let (host, node, thread, _dir) = start(
        r#"const path = require("node:path");
           __chouquette_host.onEvent(e => Promise.resolve().then(() =>
             __chouquette_host.send(e.window, path.posix.join("a", e.event))));"#,
    );
    // Posted before the app is listening: it waits.
    host.send(levain::events::input(
        "click",
        1,
        "h2",
        serde_json::json!({}),
    ));
    assert_eq!(renders(host, 1), [(1, "a/h2".into())]);
    host.send(levain::events::input(
        "click",
        0,
        "h3",
        serde_json::json!({}),
    ));
    assert_eq!(renders(host, 1), [(0, "a/h3".into())]);
    node.stop();
    assert_eq!(thread.join().unwrap(), Ok(()));
}

#[test]
fn an_app_that_throws_reports_it() {
    let (_host, _node, thread, _dir) = start("throw new Error('boom at startup')");
    let error = thread.join().unwrap().unwrap_err();
    assert!(error.contains("boom at startup"), "{error}");
}
