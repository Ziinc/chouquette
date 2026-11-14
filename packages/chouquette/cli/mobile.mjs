// `chouquette build --target <phone>`: the app embedded in the host library,
// in the Tauri mobile project levain-pack generates and builds.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "./build.mjs";

/** Phone targets: platform, Tauri target, and whether it is a device. */
export const targets = {
  "android-x86_64": { platform: "android", tauri: "x86_64" },
  "android-arm64": { platform: "android", tauri: "aarch64" },
  "ios-sim": { platform: "ios", tauri: "aarch64-sim" },
  ios: { platform: "ios", tauri: "aarch64" },
};

/**
 * The levain-pack commands that build `name` for `target`: debug builds
 * (APK, simulator .app) to test, release builds (AAB, IPA) to ship.
 */
export function mobileSteps({ target, native, archive, config, out, name, release = false, signingEnv, features = [] }) {
  const t = targets[target];
  if (!t) throw new Error(`unknown target ${target} (${Object.keys(targets).join(", ")})`);
  const project = join(native, t.platform === "android" ? "chouquette_host" : "chouquette_ios");
  const common = ["--project", project, "--config", config, "--env", `LEVAIN_APP_ARCHIVE=${archive}`];
  const init = ["init", t.platform, ...common, ...(signingEnv ? ["--signing-env", signingEnv] : [])];
  const ext = t.platform === "android" ? (release ? "aab" : "apk") : release ? "ipa" : "app";
  const tauri = [
    ...(t.platform === "android" ? [release ? "--aab" : "--apk"] : []),
    "--target", t.tauri,
    ...(release ? [] : ["--debug"]),
    ...(features.length ? ["--features", features.join(",")] : []),
  ];
  const buildArgs = ["build", t.platform, ...common, "--product", `${ext}=${join(out, `${name}.${ext}`)}`, "--", ...tauri];
  return [["levain-pack", init], ["levain-pack", buildArgs]];
}

/** Builds the app at `dir` for a phone into `out`; returns the product's path. */
export async function buildMobile({ dir, target, out = join(dir, "dist", target), release = false, features = [] }) {
  const pkg = (await import(join(dir, "package.json"), { with: { type: "json" } })).default;
  const config = (await import(join(dir, "chouquette.json"), { with: { type: "json" } })).default;
  const work = mkdtempSync(join(tmpdir(), "chouquette-mobile-"));
  const app = join(work, "app");
  await build({ dir, out: app, minify: release });
  const archive = join(work, "app.tar.gz");
  execFileSync("tar", ["czf", archive, "-C", app, "."]);
  const tauri = join(work, "tauri.json");
  writeFileSync(tauri, JSON.stringify({ productName: pkg.name, version: pkg.version ?? "0.1.0", identifier: config.identifier }));
  mkdirSync(out, { recursive: true });
  // Until the hosts ship on npm (M4): the native workspace of this checkout.
  const native = resolve(process.env.CHOUQUETTE_NATIVE ?? join(import.meta.dirname, "../../../native"));
  const signingEnv = release && target.startsWith("android") ? process.env.CHOUQUETTE_SIGNING_ENV : undefined;
  for (const [cmd, args] of mobileSteps({ target, native, archive, config: tauri, out: resolve(out), name: pkg.name, release, signingEnv, features }))
    execFileSync(process.env.LEVAIN_PACK ?? cmd, args, { stdio: "inherit" });
  return out;
}
