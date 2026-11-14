fn main() {
    // GPUI embeds its own Windows manifest (DPI awareness, common controls
    // v6); a second one from Tauri fails the link (CVT1100), as in levain.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    )
    .expect("tauri-build");
}
