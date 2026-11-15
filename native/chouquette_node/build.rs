//! Compiles the C++ shim against libnode and links it. `CHOUQUETTE_LIBNODE`
//! names a directory from `scripts/build-libnode.sh` (`lib/`, `include/node/`).
//! Without it the crate builds, and the runtime reports that this host has
//! no Node.
use std::env;
use std::path::PathBuf;

fn main() {
    println!("cargo::rustc-check-cfg=cfg(chouquette_libnode)");
    println!("cargo::rerun-if-env-changed=CHOUQUETTE_LIBNODE");
    println!("cargo::rerun-if-changed=shim/shim.cc");
    let Some(dir) = env::var_os("CHOUQUETTE_LIBNODE").map(PathBuf::from) else {
        return;
    };
    let lib = dir.join("lib");
    let mut build = cc::Build::new();
    // MSVC reports __cplusplus as C++98 unless asked; V8's headers check it.
    if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        build.flag("/Zc:__cplusplus");
    }
    build
        .cpp(true)
        .std("c++20")
        .file("shim/shim.cc")
        .include(dir.join("include/node"))
        .define("NODE_WANT_INTERNALS", "0")
        .warnings(false)
        .compile("chouquette_node_shim");
    println!("cargo::rustc-link-search=native={}", lib.display());
    println!("cargo::rustc-link-lib=dylib=node");
    // Tests and the dev host find libnode where it was built; a shipped
    // host carries it beside the executable ($ORIGIN, @executable_path).
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        println!("cargo::rustc-link-arg=-Wl,-rpath,{}", lib.display());
    }
    println!("cargo::rustc-cfg=chouquette_libnode");
}
