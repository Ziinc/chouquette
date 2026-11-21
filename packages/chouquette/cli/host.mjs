// The precompiled host an app runs on, and levain-pack beside it.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

/** The desktops chouquette ships hosts for, as npm names them. */
export const hostTargets = ["linux-x64", "linux-arm64", "darwin-arm64", "darwin-x64", "win32-x64", "win32-arm64"];

/** The `@chouquette/host-<target>` for npm's `platform` and `arch`. */
export function hostTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (!hostTargets.includes(target)) throw new Error(`no chouquette host for ${target} (${hostTargets.join(", ")})`);
  return target;
}

/**
 * The host executable, levain-pack and the host's Tauri project (for
 * bundling): `CHOUQUETTE_HOST`/`LEVAIN_PACK`, else the npm host package
 * installed with chouquette, else this checkout's own build. Null if none.
 * @param {{ from?: string, platform?: string, arch?: string, env?: Record<string, string | undefined>, checkout?: string }} [options]
 */
export function resolveHost({
  from = process.cwd(),
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  checkout = resolve(import.meta.dirname, "../../../native"),
} = {}) {
  const exe = platform === "win32" ? ".exe" : "";
  let found = null;
  try {
    const pkg = dirname(createRequire(join(from, "package.json")).resolve(`@chouquette/host-${hostTarget(platform, arch)}/package.json`));
    found = { host: join(pkg, "bin", `chouquette_host${exe}`), levainPack: join(pkg, "bin", `levain-pack${exe}`), project: join(pkg, "project") };
  } catch {
    for (const profile of ["release", "debug"]) {
      const host = join(checkout, "target", profile, `chouquette_host${exe}`);
      if (existsSync(host)) {
        found = { host, levainPack: `levain-pack${exe}`, project: join(checkout, "chouquette_host") };
        break;
      }
    }
  }
  if (env.CHOUQUETTE_HOST) found = { levainPack: `levain-pack${exe}`, project: join(checkout, "chouquette_host"), ...found, host: env.CHOUQUETTE_HOST };
  if (found && env.LEVAIN_PACK) found = { ...found, levainPack: env.LEVAIN_PACK };
  return found;
}
