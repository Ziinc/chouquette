//! The counter example, bundled by `chouquette build`, on QuickJS: it
//! renders its first frame, and a click patches the count.

use std::path::Path;
use std::process::Command;

use chouquette_quickjs::Engine;

#[path = "../src/fake_host.rs"]
mod fake;

#[test]
fn counter_renders_and_counts_clicks() {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let out = tempfile::tempdir().unwrap();
    let status = Command::new("node")
        .arg(repo.join("packages/chouquette/bin/chouquette.mjs"))
        .args(["build", "--release", "--out"])
        .arg(out.path())
        .current_dir(repo.join("examples/counter"))
        .status()
        .expect("node (run npm install at the repo root first)");
    assert!(status.success(), "chouquette build failed");
    let source = std::fs::read_to_string(out.path().join("app.js")).unwrap();

    let (api, host) = fake::FakeHost::api();
    let mut engine = Engine::new(api).unwrap();
    engine.eval(&source).unwrap();

    let renders = host.take();
    assert_eq!(renders.len(), 1);
    let (window, frame) = &renders[0];
    let frame: serde_json::Value = serde_json::from_str(frame).unwrap();
    assert_eq!(*window, 0);
    assert_eq!(
        frame["root"]["c"][0]["c"],
        serde_json::json!(["Count: ", "0"])
    );
    let button = frame["root"]["c"][1]["a"]["phx-click"].as_str().unwrap();

    host.send(levain::events::input(
        "click",
        0,
        button,
        serde_json::json!({}),
    ));
    assert!(engine.turn(Some(std::time::Duration::ZERO)));
    let patch: Vec<serde_json::Value> = host
        .take()
        .iter()
        .map(|(_, json)| serde_json::from_str(json).unwrap())
        .collect();
    assert_eq!(
        patch,
        [serde_json::json!({"patch": [{"op": "replace", "at": [0, 1], "node": "1"}]})]
    );
}
