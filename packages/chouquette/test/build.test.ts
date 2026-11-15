import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { expect, test } from "vitest";
import { build } from "../cli/build.mjs";

const counter = join(import.meta.dirname, "../../../examples/counter");

test("builds an app into app.js and levain's app.json", async () => {
  const out = mkdtempSync(join(tmpdir(), "chouquette-"));
  await build({ dir: counter, out });

  expect(JSON.parse(readFileSync(join(out, "app.json"), "utf8"))).toEqual({
    name: "counter",
    window: { title: "Counter", width: 360, height: 240 },
  });

  // Only what an embedded engine has, plus timers and the host.
  const sent: [number, unknown][] = [];
  const context = createContext({
    console, setTimeout, clearTimeout, queueMicrotask,
    __chouquette_host: { send: (w: number, json: string) => sent.push([w, JSON.parse(json)]), onEvent() {} },
  });
  runInContext(readFileSync(join(out, "app.js"), "utf8"), context);
  expect(sent).toEqual([[0, { root: expect.objectContaining({ t: "div" }), theme: expect.objectContaining({ primary: "#2563eb" }) }]]);
});

test("a declared cli goes into app.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chouquette-cli-"));
  const cliSpec = { description: "Adds numbers", subcommands: { sum: { args: [{ name: "a", index: 1, takesValue: true }] } } };
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "adder" }));
  writeFileSync(join(dir, "chouquette.json"), JSON.stringify({ entry: "app.ts", cli: cliSpec }));
  writeFileSync(join(dir, "app.ts"), "export {};\n");
  await build({ dir, out: join(dir, "dist") });
  expect(JSON.parse(readFileSync(join(dir, "dist/app.json"), "utf8"))).toEqual({ name: "adder", window: {}, cli: cliSpec });
});

test("with a host, the app ships as the host's bytecode", async () => {
  const out = mkdtempSync(join(tmpdir(), "chouquette-bc-"));
  // Stands in for `chouquette_host --compile <app.js> <app.qjsbc>`.
  const host = join(out, "host.sh");
  writeFileSync(host, '#!/bin/sh\n[ "$1" = --compile ] && printf bytecode > "$3"\n');
  chmodSync(host, 0o755);
  await build({ dir: counter, out: join(out, "app"), host });
  expect(readdirSync(join(out, "app")).sort()).toEqual(["app.json", "app.qjsbc"]);
  expect(readFileSync(join(out, "app/app.qjsbc"), "utf8")).toBe("bytecode");
});

test("for the node runtime the app is a CommonJS bundle that can require node:*", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chouquette-node-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "noder" }));
  writeFileSync(join(dir, "chouquette.json"), JSON.stringify({ entry: "app.ts", runtime: "node" }));
  writeFileSync(join(dir, "app.ts"), 'import { join } from "node:path";\n(globalThis as any).__ran = join("a", "b");\n');
  await build({ dir, out: join(dir, "dist") });
  expect(JSON.parse(readFileSync(join(dir, "dist/app.json"), "utf8")).runtime).toBe("node");
  createRequire(import.meta.url)(join(dir, "dist/app.js"));
  expect((globalThis as any).__ran).toBe(join("a", "b"));
});
