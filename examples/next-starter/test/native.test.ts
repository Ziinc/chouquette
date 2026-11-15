// The starter as chouquette runs it, headless: `chouquette build`, then the
// Next.js launcher on this Node with a host that keeps what it renders.
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { build } from "chouquette/cli/build.mjs";

test("the create-next-app starter renders its home page natively", { timeout: 300_000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), "next-starter-"));
  await build({ dir: join(import.meta.dirname, ".."), out });

  const frames: string[] = [];
  const host = { send: (_w: number, json: string) => void frames.push(json), call() {}, onEvent() {}, checkComponents: () => true };
  // As the runtime does: the host first, then the app.
  (globalThis as any).__chouquette_host = host;
  const app = createRequire(join(out, "app.js"))("./app.js") as { started: Promise<{ close(): Promise<void> }> };
  const started = await app.started;
  try {
    const text = frames.join("\n");
    expect(text).toContain("To get started, edit the ");
    expect(text).toContain("Deploy Now");
    expect(JSON.parse(frames[0]).root).toBeTruthy();
  } finally {
    await started.close();
    delete (globalThis as any).__chouquette_host;
  }
});
