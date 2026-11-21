// `chouquette dev`: bundles the app on every save and runs it on the host,
// which reloads it into a fresh JS context (CHOUQUETTE_DEV), windows open.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { build } from "./build.mjs";
import { resolveHost } from "./host.mjs";

export async function dev({ dir }) {
  const found = resolveHost({ from: dir });
  if (!found) throw new Error("no chouquette host: install chouquette with its optional dependencies, or set CHOUQUETTE_HOST");
  const out = join(dir, "dist");
  await build({ dir, out, watch: true });
  const host = spawn(found.host, [], { stdio: "inherit", env: { ...process.env, CHOUQUETTE_APP: out, CHOUQUETTE_DEV: "1" } });
  await new Promise(resolve => host.on("exit", resolve));
  process.exit(host.exitCode ?? 0);
}
