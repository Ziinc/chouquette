// `chouquette build`: bundles the app into the files levain's host runs.
//   <out>/app.js    the app as one script, React and chouquette included
//   <out>/app.json  its name and window (levain's `App`)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import { hashes } from "./components.mjs";

const require = createRequire(import.meta.url);

/**
 * With `host`, the app is also compiled to the host's QuickJS bytecode
 * (`app.qjsbc`), which it runs in place of `app.js`.
 * With `watch`, it bundles again on every change to the app's files.
 * @param {{ dir: string, out?: string, minify?: boolean, host?: string, watch?: boolean }} options
 */
export async function build({ dir, out = join(dir, "dist"), minify = false, host, watch = false }) {
  const config = JSON.parse(readFileSync(join(dir, "chouquette.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  mkdirSync(out, { recursive: true });
  // The native component sets the app uses; the runtime checks them against the host's.
  const sets = (config.components ?? ["gpui-kit"]).map(set =>
    JSON.parse(readFileSync(join(import.meta.dirname, "../components", `${set}.json`), "utf8")),
  );

  /** @type {import("esbuild").BuildOptions} */
  const options = {
    entryPoints: [join(dir, config.entry ?? "src/app.tsx")],
    outfile: join(out, "app.js"),
    absWorkingDir: dir,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    minify,
    alias: { "react-dom": "@chouquette/react-dom" },
    // Where chouquette's own dependencies are, for when npm didn't hoist them.
    nodePaths: [join(dirname(require.resolve("@chouquette/react-dom/package.json")), "../..")],
    define: { "process.env.NODE_ENV": JSON.stringify(minify ? "production" : "development") },
    banner: { js: `globalThis.__chouquette_components = ${JSON.stringify(hashes(sets))};` },
    logLevel: "warning",
  };
  if (watch) {
    const context = await esbuild.context(options);
    // `watch` starts before its first bundle is written: the host must find one.
    await context.rebuild();
    await context.watch();
  }
  else await esbuild.build(options);

  if (host) {
    execFileSync(host, ["--compile", join(out, "app.js"), join(out, "app.qjsbc")], { stdio: "inherit" });
    rmSync(join(out, "app.js"));
  } else rmSync(join(out, "app.qjsbc"), { force: true });

  const app = { name: pkg.name, window: config.window ?? {}, ...(config.cli && { cli: config.cli }) };
  writeFileSync(join(out, "app.json"), JSON.stringify(app, null, 2) + "\n");
  return { out };
}
