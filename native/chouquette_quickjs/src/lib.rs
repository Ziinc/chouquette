//! Runs chouquette apps on QuickJS inside levain's host: the app's bundle
//! (`app.js`, from `chouquette build`) on a JS thread of its own, talking to
//! the host only through levain's C ABI.

mod engine;
#[cfg(test)]
mod fake_host;

use std::path::{Path, PathBuf};

pub use engine::{Engine, compile};
use levain::{App, AppPaths, Runtime, WindowConfig};

/// The QuickJS runtime.
#[derive(Debug, Default)]
pub struct QuickJs;

impl Runtime for QuickJs {
    fn locate(&self, paths: &AppPaths) -> Result<App, String> {
        locate_in(&candidates(paths)?)
    }

    fn start(&self, app: App, api: &'static levain::levain_abi::HostApi) -> Result<(), String> {
        let code = Code::read(&app.root)?;
        let dev = std::env::var_os("CHOUQUETTE_DEV").is_some();
        std::thread::Builder::new()
            .name("chouquette-js".into())
            .spawn(move || {
                let result = if dev {
                    run_dev(api, &app.root)
                } else {
                    Engine::new(api).and_then(|mut engine| engine.run(&code))
                };
                if let Err(error) = result {
                    levain::log_line(&format!("chouquette: {error}"));
                }
            })
            .map(drop)
            .map_err(|e| e.to_string())
    }
}

/// `chouquette dev`: runs the app and, whenever its `app.js` changes, runs
/// the new one in a fresh context, which renders its windows afresh.
fn run_dev(api: &'static levain::levain_abi::HostApi, root: &Path) -> Result<(), String> {
    let mut watch = Watch::new(&root.join("app.js"));
    loop {
        let mut engine = Engine::new(api)?;
        if let Err(error) = Code::read(root).and_then(|code| engine.load(&code)) {
            levain::log_line(&format!("chouquette: {error}"));
        }
        levain::log_line("chouquette: app loaded");
        while !watch.changed() {
            engine.turn(Some(std::time::Duration::from_millis(250)));
        }
    }
}

/// Whether a file changed since last asked, by its modification time.
struct Watch {
    path: PathBuf,
    stamp: Option<std::time::SystemTime>,
}

impl Watch {
    fn new(path: &Path) -> Self {
        let stamp = Self::stamp(path);
        Self {
            path: path.into(),
            stamp,
        }
    }

    fn stamp(path: &Path) -> Option<std::time::SystemTime> {
        std::fs::metadata(path).and_then(|m| m.modified()).ok()
    }

    fn changed(&mut self) -> bool {
        let now = Self::stamp(&self.path);
        now != self.stamp && std::mem::replace(&mut self.stamp, now) != now
    }
}

/// An app's code: bytecode from `chouquette build --release`, else its script.
pub enum Code {
    Bytecode(Vec<u8>),
    Script(String),
}

impl Code {
    pub fn read(root: &Path) -> Result<Self, String> {
        let read = |name: &str| {
            let path = root.join(name);
            std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))
        };
        if root.join("app.qjsbc").is_file() {
            return read("app.qjsbc").map(Code::Bytecode);
        }
        let source = read("app.js")?;
        String::from_utf8(source)
            .map(Code::Script)
            .map_err(|e| format!("app.js: {e}"))
    }
}

/// Where an app may be, in order: `CHOUQUETTE_APP`, then `app/` in the
/// bundle's resources and next to the executable on desktop, or the app
/// unpacked from the host library on mobile.
fn candidates(paths: &AppPaths) -> Result<Vec<PathBuf>, String> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("CHOUQUETTE_APP")
        .map(PathBuf::from)
        .into_iter()
        .collect();
    #[cfg(any(target_os = "android", target_os = "ios"))]
    if let Some(data) = &paths.data {
        dirs.push(levain::mobile::unpack(data, |_| Ok(()))?);
    }
    dirs.extend(paths.resources.iter().map(|r| r.join("app")));
    dirs.extend(
        paths
            .exe
            .iter()
            .filter_map(|e| e.parent())
            .map(|d| d.join("app")),
    );
    Ok(dirs)
}

/// The first of `dirs` that holds an `app.qjsbc` or `app.js`, with its `app.json`.
pub fn locate_in(dirs: &[PathBuf]) -> Result<App, String> {
    let Some(root) = dirs
        .iter()
        .find(|dir| dir.join("app.qjsbc").is_file() || dir.join("app.js").is_file())
    else {
        let looked: Vec<String> = dirs.iter().map(|d| d.display().to_string()).collect();
        return Err(format!("no app.js in {}", looked.join(", ")));
    };
    let json = std::fs::read(root.join("app.json")).unwrap_or_default();
    Ok(App {
        root: root.clone(),
        name: app_name(&json, root),
        window: WindowConfig::from_app_json(&json),
        cli: levain::cli_from_app_json(&json),
    })
}

fn app_name(json: &[u8], root: &Path) -> String {
    serde_json::from_slice::<serde_json::Value>(json)
        .ok()
        .and_then(|v| v.get("name")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| {
            root.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locates_the_first_dir_with_an_app() {
        let empty = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        std::fs::write(app.path().join("app.js"), "").unwrap();
        std::fs::write(
            app.path().join("app.json"),
            r#"{"name": "counter", "window": {"title": "Counter", "width": 360}, "cli": {"description": "Counts"}}"#,
        )
        .unwrap();

        let found = locate_in(&[empty.path().into(), app.path().into()]).unwrap();
        assert_eq!(found.root, app.path());
        assert_eq!(found.name, "counter");
        assert_eq!(found.window.title.as_deref(), Some("Counter"));
        assert_eq!((found.window.width, found.window.height), (360.0, 360.0));
        assert_eq!(
            found.cli,
            Some(serde_json::json!({"description": "Counts"}))
        );
    }

    #[test]
    fn an_app_may_ship_only_bytecode() {
        let app = tempfile::tempdir().unwrap();
        std::fs::write(app.path().join("app.qjsbc"), b"").unwrap();
        assert_eq!(locate_in(&[app.path().into()]).unwrap().root, app.path());
    }

    #[test]
    fn dev_mode_notices_a_new_bundle() {
        let app = tempfile::tempdir().unwrap();
        let path = app.path().join("app.js");
        std::fs::write(&path, "1").unwrap();
        let mut watch = Watch::new(&path);
        assert!(!watch.changed());
        let file = std::fs::File::options().write(true).open(&path).unwrap();
        file.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(5))
            .unwrap();
        assert!(watch.changed());
        assert!(!watch.changed());
    }

    #[test]
    fn a_reloaded_engine_takes_the_events() {
        let (api, host) = crate::fake_host::FakeHost::api();
        let listen = "__chouquette_host.onEvent(e => __chouquette_host.send(0, NAME))";
        let mut first = Engine::new(api).unwrap();
        first.eval(&listen.replace("NAME", "'first'")).unwrap();
        let mut second = Engine::new(api).unwrap();
        second.eval(&listen.replace("NAME", "'second'")).unwrap();
        drop(first);
        host.send(levain::events::resync(0));
        assert!(second.turn(Some(std::time::Duration::ZERO)));
        assert_eq!(host.take(), [(0, "second".into())]);
    }

    #[test]
    fn says_where_it_looked() {
        let empty = tempfile::tempdir().unwrap();
        let error = locate_in(&[empty.path().into()]).unwrap_err();
        assert!(
            error.contains(&empty.path().display().to_string()),
            "{error}"
        );
    }
}
