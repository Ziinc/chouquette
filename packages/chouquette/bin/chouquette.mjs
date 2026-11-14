#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { build } from "../cli/build.mjs";
import { componentTypes } from "../cli/components.mjs";
import { buildMobile, targets } from "../cli/mobile.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    release: { type: "boolean" },
    target: { type: "string" },
    features: { type: "string" },
    host: { type: "string" },
  },
});

const usage = `usage:
  chouquette build [--out dir] [--release] [--target ${Object.keys(targets).join("|")}] [--features a,b]
  chouquette components --host <exe> --out <file.d.ts>   JSX types for the host's native component sets`;

switch (positionals[0]) {
  case "build": {
    const dir = process.cwd();
    const features = values.features ? values.features.split(",") : [];
    const out = values.target
      ? await buildMobile({ dir, target: values.target, out: values.out, release: values.release, features })
      : (await build({ dir, out: values.out, minify: values.release })).out;
    console.log(`built ${out}`);
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
