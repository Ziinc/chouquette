//! Runs chouquette apps on QuickJS inside levain's host: the app's bundle
//! (`app.js`, from `chouquette build`) on a JS thread of its own, talking to
//! the host only through levain's C ABI.

mod engine;
#[cfg(test)]
mod fake_host;

use std::path::{Path, PathBuf};

pub use engine::Engine;
use levain::{App, AppPaths, Runtime, WindowConfig};

/// The QuickJS runtime.
#[derive(Debug, Default)]
pub struct QuickJs;

impl Runtime for QuickJs {
    fn locate(&self, paths: &AppPaths) -> Result<App, String> {
        locate_in(&candidates(paths)?)
    }

    fn start(&self, app: App, api: &'static levain::levain_abi::HostApi) -> Result<(), String> {
        let path = app.root.join("app.js");
        let source =
            std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        std::thread::Builder::new()
            .name("chouquette-js".into())
            .spawn(move || {
                if let Err(error) = Engine::new(api).and_then(|mut engine| engine.run(&source)) {
                    levain::log_line(&format!("chouquette: {error}"));
                }
            })
            .map(drop)
            .map_err(|e| e.to_string())
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

/// The first of `dirs` that holds an `app.js`, with its `app.json`.
pub fn locate_in(dirs: &[PathBuf]) -> Result<App, String> {
    let Some(root) = dirs.iter().find(|dir| dir.join("app.js").is_file()) else {
        let looked: Vec<String> = dirs.iter().map(|d| d.display().to_string()).collect();
        return Err(format!("no app.js in {}", looked.join(", ")));
    };
    let json = std::fs::read(root.join("app.json")).unwrap_or_default();
    Ok(App {
        root: root.clone(),
        name: app_name(&json, root),
        window: WindowConfig::from_app_json(&json),
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
            r#"{"name": "counter", "window": {"title": "Counter", "width": 360}}"#,
        )
        .unwrap();

        let found = locate_in(&[empty.path().into(), app.path().into()]).unwrap();
        assert_eq!(found.root, app.path());
        assert_eq!(found.name, "counter");
        assert_eq!(found.window.title.as_deref(), Some("Counter"));
        assert_eq!((found.window.width, found.window.height), (360.0, 360.0));
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
