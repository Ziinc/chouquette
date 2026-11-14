#!/usr/bin/env node
import { parseArgs } from "node:util";
import { build } from "../cli/build.mjs";
import { buildMobile, targets } from "../cli/mobile.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, release: { type: "boolean" }, target: { type: "string" }, features: { type: "string" } },
});

const usage = `usage: chouquette build [--out dir] [--release] [--target ${Object.keys(targets).join("|")}] [--features a,b]`;

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
  default:
    console.error(usage);
    process.exit(1);
}
