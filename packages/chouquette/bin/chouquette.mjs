#!/usr/bin/env node
import { parseArgs } from "node:util";
import { build } from "../cli/build.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, release: { type: "boolean" } } });

switch (positionals[0]) {
  case "build": {
    const { out } = await build({ dir: process.cwd(), out: values.out, minify: values.release });
    console.log(`built ${out}`);
    break;
  }
  default:
    console.error("usage: chouquette build [--out dir] [--release]");
    process.exit(1);
}
