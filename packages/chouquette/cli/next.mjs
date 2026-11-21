// `chouquette build` for a Next.js app (one with a next.config): `next build`
// with webpack (withChouquette in its config), then the standalone server,
// its static files and the launcher, as the app the Node runtime runs.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import * as esbuild from "esbuild";

const require = createRequire(import.meta.url);

export const isNextApp = dir => ["next.config.ts", "next.config.mjs", "next.config.js"].some(f => existsSync(join(dir, f)));

/** The directory under `.next/standalone` that holds the app's server.js. */
function standaloneApp(root) {
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift();
    if (existsSync(join(dir, "server.js")) && existsSync(join(dir, ".next"))) return dir;
    for (const name of readdirSync(dir)) {
      const sub = join(dir, name);
      if (name !== "node_modules" && statSync(sub).isDirectory()) queue.push(sub);
    }
  }
  throw new Error(`no server.js under ${root}: is withChouquette in next.config?`);
}

/** @param {{ dir: string, out: string }} options */
export async function buildNext({ dir, out }) {
  const next = createRequire(join(dir, "package.json")).resolve("next/dist/bin/next");
  execFileSync(process.execPath, [next, "build", "--webpack"], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const standalone = join(dir, ".next/standalone");
  cpSync(standalone, out, { recursive: true, verbatimSymlinks: true });
  // The app's root within the standalone tree (nested in a monorepo).
  const appDir = join(out, relative(standalone, standaloneApp(standalone)));
  cpSync(join(dir, ".next/static"), join(appDir, ".next/static"), { recursive: true });
  if (existsSync(join(dir, "public"))) cpSync(join(dir, "public"), join(appDir, "public"), { recursive: true });

  // The launcher is CommonJS; a monorepo's root package.json, copied in by
  // the standalone trace, may say otherwise.
  const rootPkg = join(out, "package.json");
  const root = existsSync(rootPkg) ? JSON.parse(readFileSync(rootPkg, "utf8")) : {};
  writeFileSync(rootPkg, `${JSON.stringify({ ...root, type: "commonjs" }, null, 2)}\n`);

  // The launcher, with happy-dom and light-my-request; Next from the app.
  await esbuild.build({
    stdin: {
      contents: `module.exports.started = require(${JSON.stringify(require.resolve("../next/run.cjs"))}).run({ dir: require("node:path").join(__dirname, ${JSON.stringify(relative(out, appDir))}) });`,
      resolveDir: dirname(require.resolve("../next/run.cjs")),
      loader: "js",
    },
    outfile: join(out, "app.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    logLevel: "warning",
  });

  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const config = existsSync(join(dir, "chouquette.json")) ? JSON.parse(readFileSync(join(dir, "chouquette.json"), "utf8")) : {};
  writeFileSync(join(out, "app.json"), `${JSON.stringify({ name: pkg.name, window: config.window ?? {}, runtime: "node" }, null, 2)}\n`);
  return { out };
}
