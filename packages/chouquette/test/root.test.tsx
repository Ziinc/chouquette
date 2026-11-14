import { expect, test, vi } from "vitest";
import { createRoot } from "../src/root";
import type { HostEvent } from "../src/wire";

test("a resync sends the whole frame again", () => {
  const sent: string[] = [];
  let emit: (e: HostEvent) => void = () => {};
  const root = createRoot({ window: 0 }, { send: (_w, json) => sent.push(json), onEvent: l => (emit = l) });
  root.render(<p>hi</p>);
  sent.length = 0;
  emit({ type: "resync", window: 0 });
  expect(sent.map(s => JSON.parse(s))).toEqual([{ root: { t: "p", a: {}, c: ["hi"] } }]);
});

test("renders without React warnings", () => {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
  try {
    createRoot({ window: 0 }, { send() {}, onEvent() {} }).render(<p><span>hi</span></p>);
  } finally {
    spy.mockRestore();
  }
  expect(errors).toEqual([]);
});
