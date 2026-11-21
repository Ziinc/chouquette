// Makes `@chouquette/host-<target>`: one desktop's precompiled host and
// levain-pack, with the host's Tauri project (for `chouquette bundle`).
//
//   node scripts/pack-host.mjs <target> <version> <host> <levain-pack> <out>
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const native = join(import.meta.dirname, "../native/chouquette_host");

/** @param {{ target: string, version: string, host: string, levainPack: string, out: string }} o */
export function packHost({ target, version, host, levainPack, out }) {
  const [os, cpu] = target.split("-");
  mkdirSync(join(out, "bin"), { recursive: true });
  for (const file of [host, levainPack]) cpSync(file, join(out, "bin", basename(file)));
  for (const file of ["tauri.conf.json", "capabilities", "icons", "dist"]) cpSync(join(native, file), join(out, "project", file), { recursive: true });
  // Tauri's bundler reads the project's Cargo.toml for its metadata; nothing is compiled.
  writeFileSync(
    join(out, "project", "Cargo.toml"),
    `[package]\nname = "chouquette_host"\nversion = "${version}"\nedition = "2024"\nlicense = "MIT"\n\n[[bin]]\nname = "chouquette_host"\npath = "main.rs"\n`,
  );
  const pkg = {
    name: `@chouquette/host-${target}`,
    version,
    description: `chouquette's precompiled host for ${target}`,
    license: "MIT",
    repository: "github:Ziinc/chouquette",
    os: [os],
    cpu: [cpu],
    files: ["bin", "project"],
  };
  writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  return out;
}

if (process.argv[1] === import.meta.filename) {
  const [target, version, host, levainPack, out] = process.argv.slice(2);
  console.log(packHost({ target, version, host, levainPack, out }));
}
