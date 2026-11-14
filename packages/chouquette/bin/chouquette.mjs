#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { build } from "../cli/build.mjs";
import { bundle } from "../cli/bundle.mjs";
import { componentTypes } from "../cli/components.mjs";
import { dev } from "../cli/dev.mjs";
import { resolveHost } from "../cli/host.mjs";
import { buildMobile, targets } from "../cli/mobile.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    release: { type: "boolean" },
    target: { type: "string" },
    features: { type: "string" },
    host: { type: "string" },
    bundles: { type: "string" },
    script: { type: "boolean" },
  },
});

const usage = `usage:
  chouquette dev                                  runs the app, reloading it as its files change
  chouquette build [--out dir] [--release [--script]] [--target ${Object.keys(targets).join("|")}] [--features a,b]
  chouquette bundle [--bundles deb,appimage|app,dmg|msi] [--out dir]
  chouquette components --host <exe> --out <file.d.ts>   JSX types for the host's native component sets`;

const dir = process.cwd();
switch (positionals[0]) {
  case "dev":
    await dev({ dir });
    break;
  case "build": {
    const features = values.features ? values.features.split(",") : [];
    const out = values.target
      ? await buildMobile({ dir, target: values.target, out: values.out, release: values.release, features })
      : (await build({ dir, out: values.out, minify: values.release, host: values.release && !values.script ? resolveHost({ from: dir })?.host : undefined })).out;
    console.log(`built ${out}`);
    break;
  }
  case "bundle": {
    const out = await bundle({ dir, out: values.out, bundles: values.bundles?.split(",") });
    console.log(`bundled into ${out}`);
    break;
  }
  case "components": {
    if (!values.host || !values.out) {
      console.error(usage);
      process.exit(1);
    }
    const manifests = JSON.parse(execFileSync(values.host, ["--manifest"], { encoding: "utf8" }));
    writeFileSync(values.out, componentTypes(manifests));
    console.log(`wrote ${values.out}`);
    break;
  }
  default:
    console.error(usage);
    process.exit(1);
}
