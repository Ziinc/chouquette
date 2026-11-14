//! chouquette's host: levain with the QuickJS runtime.

use std::path::PathBuf;

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
    levain::run(chouquette_quickjs::QuickJs, tauri::generate_context!());
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
