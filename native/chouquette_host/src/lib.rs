//! chouquette's host: levain with the QuickJS runtime and, built with
//! libnode, embedded Node; each app picks one in its app.json.

use std::path::PathBuf;

use chouquette_node::NodeJs;
use chouquette_quickjs::QuickJs;
use levain::{App, AppPaths, Runtime, levain_abi::HostApi};

/// The engine an app's app.json asks for (`"runtime"`), QuickJS by default.
#[derive(Debug, PartialEq)]
enum Engine {
    QuickJs,
    Node,
}

fn runtime_of(app_json: &[u8]) -> Engine {
    let runtime = serde_json::from_slice::<serde_json::Value>(app_json)
        .ok()
        .and_then(|v| v.get("runtime")?.as_str().map(str::to_owned));
    if runtime.as_deref() == Some("node") {
        Engine::Node
    } else {
        Engine::QuickJs
    }
}

/// Both runtimes: QuickJS finds the app (`app.js` or its bytecode), and the
/// app's own choice runs it.
struct Runtimes;

impl Runtime for Runtimes {
    fn locate(&self, paths: &AppPaths) -> Result<App, String> {
        QuickJs.locate(paths)
    }

    fn start(&self, app: App, api: &'static HostApi) -> Result<(), String> {
        match runtime_of(&std::fs::read(app.root.join("app.json")).unwrap_or_default()) {
            Engine::Node => NodeJs.start(app, api),
            Engine::QuickJs => QuickJs.start(app, api),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `--compile <app.js> <app.qjsbc>`: bytecode for this host's QuickJS,
    // which `chouquette build --release` asks of the host it ships.
    #[cfg(desktop)]
    if let Some(paths) = compile_args(&std::env::args().collect::<Vec<_>>()) {
        if let Err(error) = paths.and_then(|(source, out)| compile(&source, &out)) {
            eprintln!("chouquette: {error}");
            std::process::exit(1);
        }
        return;
    }
    levain::run(Runtimes, tauri::generate_context!());
}

/// The paths of `--compile <source> <out>`, when it is among `args`.
#[cfg_attr(mobile, allow(dead_code))]
fn compile_args(args: &[String]) -> Option<Result<(PathBuf, PathBuf), String>> {
    let at = args.iter().position(|arg| arg == "--compile")?;
    Some(match (args.get(at + 1), args.get(at + 2)) {
        (Some(source), Some(out)) => Ok((source.into(), out.into())),
        _ => Err("usage: --compile <app.js> <app.qjsbc>".into()),
    })
}

#[cfg_attr(mobile, allow(dead_code))]
fn compile(source: &std::path::Path, out: &std::path::Path) -> Result<(), String> {
    let code = std::fs::read_to_string(source).map_err(|e| format!("{}: {e}", source.display()))?;
    let bytecode = chouquette_quickjs::compile(&code)?;
    std::fs::write(out, bytecode).map_err(|e| format!("{}: {e}", out.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn apps_pick_their_runtime() {
        assert_eq!(runtime_of(br#"{"runtime": "node"}"#), Engine::Node);
        assert_eq!(runtime_of(br#"{"runtime": "quickjs"}"#), Engine::QuickJs);
        assert_eq!(runtime_of(b"{}"), Engine::QuickJs);
        assert_eq!(runtime_of(b""), Engine::QuickJs);
    }

    #[test]
    fn compile_only_when_asked() {
        assert!(compile_args(&args(&["host"])).is_none());
        assert!(
            compile_args(&args(&["host", "--compile", "a.js"]))
                .unwrap()
                .is_err()
        );
    }

    #[test]
    fn compiles_a_script_to_bytecode() {
        let dir = tempfile::tempdir().unwrap();
        let (source, out) = (dir.path().join("app.js"), dir.path().join("app.qjsbc"));
        std::fs::write(&source, "globalThis.x = 1;").unwrap();
        let (s, o) = compile_args(&args(&[
            "host",
            "--compile",
            source.to_str().unwrap(),
            out.to_str().unwrap(),
        ]))
        .unwrap()
        .unwrap();
        compile(&s, &o).unwrap();
        assert!(!std::fs::read(&out).unwrap().is_empty());
    }
}
