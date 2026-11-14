import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { packHost } from "../../../scripts/pack-host.mjs";

test("a host package for one target: the host, levain-pack and the Tauri project", () => {
  const dir = mkdtempSync(join(tmpdir(), "pack-"));
  for (const f of ["chouquette_host.exe", "levain-pack.exe"]) writeFileSync(join(dir, f), "bin");
  const out = packHost({ target: "win32-arm64", version: "0.2.0", host: join(dir, "chouquette_host.exe"), levainPack: join(dir, "levain-pack.exe"), out: join(dir, "out") });

  expect(JSON.parse(readFileSync(join(out, "package.json"), "utf8"))).toEqual({
    name: "@chouquette/host-win32-arm64",
    version: "0.2.0",
    description: "chouquette's precompiled host for win32-arm64",
    license: "MIT",
    repository: "github:Ziinc/chouquette",
    os: ["win32"],
    cpu: ["arm64"],
    files: ["bin", "project"],
  });
  for (const f of ["bin/chouquette_host.exe", "bin/levain-pack.exe", "project/tauri.conf.json", "project/capabilities/default.json", "project/icons/icon.png", "project/Cargo.toml"])
    expect(existsSync(join(out, f)), f).toBe(true);
  // Tauri's bundler reads the project's Cargo.toml (nothing is compiled).
  expect(readFileSync(join(out, "project/Cargo.toml"), "utf8")).toContain('name = "chouquette_host"\nversion = "0.2.0"');
});

test("chouquette depends on every host, optionally, at its own version", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));
  expect(Object.keys(pkg.optionalDependencies).sort()).toEqual(
    ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"].map(t => `@chouquette/host-${t}`),
  );
  expect(new Set(Object.values(pkg.optionalDependencies))).toEqual(new Set([pkg.version]));
});
