import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  expect(sent).toEqual([[0, { root: expect.objectContaining({ t: "div" }) }]]);
});
