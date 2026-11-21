fn main() {
    // GPUI embeds its own Windows manifest (DPI awareness, common controls
    // v6); a second one from Tauri fails the link (CVT1100), as in levain.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    )
    .expect("tauri-build");
    // A host with embedded Node ships libnode beside its executable.
    println!("cargo::rerun-if-env-changed=CHOUQUETTE_LIBNODE");
    if std::env::var_os("CHOUQUETTE_LIBNODE").is_some() {
        match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
            Ok("linux") => println!("cargo::rustc-link-arg-bins=-Wl,-rpath,$ORIGIN"),
            Ok("macos") => println!("cargo::rustc-link-arg-bins=-Wl,-rpath,@executable_path"),
            _ => {}
        }
    }
}
