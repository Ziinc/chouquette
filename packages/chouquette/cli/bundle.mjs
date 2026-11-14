// `chouquette bundle`: desktop bundles (deb, AppImage, dmg, msi, ...) of the
// app around the precompiled host, by levain-pack and Tauri's bundler. The
// app goes in the bundle's resources as `app/`, where the host looks.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "./build.mjs";
import { resolveHost } from "./host.mjs";

/**
 * @param {{ levainPack: string, project: string, host: string, name: string, version: string,
 *   identifier: string, bundles: string[], app: string, work: string, out: string }} o
 * @returns {[string, string[]]}
 */
export function bundleSteps(o) {
  return [o.levainPack, [
    "bundle", "--project", o.project, "--host", o.host, "--host-name", "chouquette_host",
    "--name", o.name, "--version", o.version, "--identifier", o.identifier, "--bundles", o.bundles.join(","),
    "--target-dir", o.work, "--out", o.out, "--resource", `${o.app}/=app/`,
  ]];
}

/** The platform's usual bundles. */
export const defaultBundles = { linux: ["deb", "appimage"], darwin: ["app", "dmg"], win32: ["msi"] };

/** Builds the app at `dir` for release and bundles it into `out`. */
export async function bundle({ dir, out = join(dir, "dist", "bundle"), bundles }) {
  const found = resolveHost({ from: dir });
  if (!found) throw new Error("no chouquette host: install chouquette with its optional dependencies, or set CHOUQUETTE_HOST");
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const config = JSON.parse(readFileSync(join(dir, "chouquette.json"), "utf8"));
  const app = join(dir, "dist", "app");
  await build({ dir, out: app, minify: true, host: found.host });
  const [cmd, args] = bundleSteps({
    ...found,
    name: pkg.name,
    version: pkg.version ?? "0.1.0",
    identifier: config.identifier,
    bundles: bundles ?? defaultBundles[process.platform] ?? [],
    app: resolve(app),
    work: mkdtempSync(join(tmpdir(), "chouquette-bundle-")),
    out: resolve(out),
  });
  execFileSync(cmd, args, { stdio: "inherit" });
  return out;
}
