// `chouquette build`: bundles the app into the files levain's host runs.
//   <out>/app.js    the app as one script, React and chouquette included
//   <out>/app.json  its name and window (levain's `App`)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import { hashes } from "./components.mjs";

const require = createRequire(import.meta.url);

/** @param {{ dir: string, out?: string, minify?: boolean }} options */
export async function build({ dir, out = join(dir, "dist"), minify = false }) {
  const config = JSON.parse(readFileSync(join(dir, "chouquette.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  mkdirSync(out, { recursive: true });
  // The native component sets the app uses; the runtime checks them against the host's.
  const sets = (config.components ?? ["gpui-kit"]).map(set =>
    JSON.parse(readFileSync(join(import.meta.dirname, "../components", `${set}.json`), "utf8")),
  );

  await esbuild.build({
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
  });

  const app = { name: pkg.name, window: config.window ?? {}, ...(config.cli && { cli: config.cli }) };
  writeFileSync(join(out, "app.json"), JSON.stringify(app, null, 2) + "\n");
  return { out };
}
