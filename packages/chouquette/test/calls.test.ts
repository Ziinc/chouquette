// Conformance with levain's calls.json (the requests chouquette makes) and
// the reply events in events.json (how their promises settle).
import { afterEach, expect, test } from "vitest";
import { app, cli, clipboard, menu, windows } from "../src/platform";
import { setHost } from "../src/host";
import type { HostEvent } from "../src/wire";
import calls from "./fixtures/calls.json";
import events from "./fixtures/events.json";

let sent: Record<string, unknown>[] = [];
let emit: (e: HostEvent) => void = () => {};
afterEach(() => setHost(undefined));

function host() {
  sent = [];
  setHost({ send() {}, onEvent: l => (emit = l), call: json => void sent.push(JSON.parse(json)) });
}

// Each valid request in calls.json, as an app makes it.
const requests: Record<string, () => Promise<unknown>> = {
  "clipboard.read": () => clipboard.read(),
  "clipboard.write": () => clipboard.write("copied"),
  "app.appearance": () => app.appearance(),
  "app.open_url": () => app.openUrl("https://example.com"),
  "menu.set": () => menu.set(calls.find(c => c.name === "menu.set")!.json!.args.menus as Parameters<typeof menu.set>[0]),
  "window.open": () => windows.open(4, { title: "Details", width: 400, height: 300 }),
  "window.open with defaults": () => windows.open(1),
  "window.close": () => windows.close(4),
  "window.set_title": () => windows.setTitle(0, "Jobs (3)"),
  "window.set_bounds, size and position": () => windows.setBounds(0, { x: 10, y: 20, width: 800, height: 600 }),
  "window.set_bounds, size only": () => windows.setBounds(2, { width: 640.5 }),
  "window.info": () => windows.info(0),
  "cli.matches": () => cli.matches(),
  "app.exit with a code": () => app.exit(2),
  "app.exit without a code": () => app.exit(),
};

const valid = calls.filter(c => !("reply" in c));

test("every valid request is covered", () => {
  expect(valid.map(c => c.name).sort()).toEqual(Object.keys(requests).sort());
});

for (const { name, json } of valid) {
  test(name, () => {
    host();
    void requests[name]();
    expect(sent).toEqual([{ ...json, ref: expect.any(Number) }]);
  });
}

const replies = (events as unknown as { name: string; json: HostEvent & { ref: number; result: unknown; error?: string } }[]).filter(
  e => e.json.type === "reply",
);

for (const { name, json } of replies) {
  test(name, async () => {
    host();
    const promise = clipboard.read();
    emit({ ...json, ref: sent[0].ref as number });
    if (json.error) await expect(promise).rejects.toThrow(json.error);
    else await expect(promise).resolves.toEqual(json.result);
  });
}

test("a reply to another call leaves a call pending", async () => {
  host();
  const first = clipboard.read();
  const second = clipboard.read();
  emit({ type: "reply", ref: sent[1].ref as number, result: "b" });
  emit({ type: "reply", ref: sent[0].ref as number, result: "a" });
  expect(await Promise.all([first, second])).toEqual(["a", "b"]);
});
