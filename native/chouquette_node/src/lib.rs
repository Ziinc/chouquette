//! Runs chouquette apps on embedded Node: the app's bundle (`app.js`, from
//! `chouquette build` with `"runtime": "node"`) in a Node environment on a
//! thread of its own, with every Node API, talking to the host only through
//! levain's C ABI. Next.js apps run here.

use std::path::{Path, PathBuf};

use levain::{App, AppPaths, Runtime, WindowConfig, levain_abi::HostApi};

#[cfg(chouquette_libnode)]
mod node;

/// The embedded Node runtime.
#[derive(Debug, Default)]
pub struct NodeJs;

impl Runtime for NodeJs {
    fn locate(&self, paths: &AppPaths) -> Result<App, String> {
        let mut dirs: Vec<PathBuf> = std::env::var_os("CHOUQUETTE_APP")
            .map(PathBuf::from)
            .into_iter()
            .collect();
        dirs.extend(paths.resources.iter().map(|r| r.join("app")));
        dirs.extend(
            paths
                .exe
                .iter()
                .filter_map(|e| e.parent())
                .map(|d| d.join("app")),
        );
        locate_in(&dirs)
    }

    fn start(&self, app: App, api: &'static HostApi) -> Result<(), String> {
        start(&app.root.join("app.js"), api)
    }
}

/// Runs the app at `entry` on a new thread, wired to `api`.
#[cfg(chouquette_libnode)]
pub fn start(entry: &Path, api: &'static HostApi) -> Result<(), String> {
    let node = node::Node::new(api)?;
    let entry = entry.to_owned();
    std::thread::Builder::new()
        .name("chouquette-node".into())
        .spawn(move || {
            if let Err(error) = node.run(&entry) {
                levain::log_line(&format!("chouquette: {error}"));
            }
        })
        .map(drop)
        .map_err(|e| e.to_string())
}

#[cfg(not(chouquette_libnode))]
pub fn start(_entry: &Path, _api: &'static HostApi) -> Result<(), String> {
    Err("this host was built without Node (CHOUQUETTE_LIBNODE)".into())
}

#[cfg(chouquette_libnode)]
pub use node::Node;

/// The first of `dirs` that holds an `app.js`, with its `app.json`.
pub fn locate_in(dirs: &[PathBuf]) -> Result<App, String> {
    let Some(root) = dirs.iter().find(|dir| dir.join("app.js").is_file()) else {
        let looked: Vec<String> = dirs.iter().map(|d| d.display().to_string()).collect();
        return Err(format!("no app.js in {}", looked.join(", ")));
    };
    let json = std::fs::read(root.join("app.json")).unwrap_or_default();
    let name = serde_json::from_slice::<serde_json::Value>(&json)
        .ok()
        .and_then(|v| v.get("name")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| {
            root.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default()
        });
    Ok(App {
        root: root.clone(),
        name,
        window: WindowConfig::from_app_json(&json),
        cli: levain::cli_from_app_json(&json),
    })
}
