//! chouquette's host: levain with the QuickJS runtime.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    levain::run(chouquette_quickjs::QuickJs, tauri::generate_context!());
}
