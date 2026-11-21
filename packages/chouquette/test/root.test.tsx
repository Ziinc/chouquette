import { startTransition, useEffect, useState } from "react";
import { expect, test, vi } from "vitest";
import { createRoot } from "../src/root";
import type { HostEvent } from "../src/wire";

test("a resync sends the whole frame again", () => {
  const sent: string[] = [];
  let emit: (e: HostEvent) => void = () => {};
  const root = createRoot({ window: 0 }, { send: (_w, json) => sent.push(json), onEvent: l => (emit = l), call() {} });
  root.render(<p>hi</p>);
  sent.length = 0;
  emit({ type: "resync", window: 0 });
  expect(sent.map(s => JSON.parse(s))).toEqual([{ root: { t: "p", a: {}, c: ["hi"] } }]);
});

test("renders without React warnings", () => {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
  try {
    createRoot({ window: 0 }, { send() {}, onEvent() {}, call() {} }).render(<p><span>hi</span></p>);
  } finally {
    spy.mockRestore();
  }
  expect(errors).toEqual([]);
});

test("a render in a transition commits, as Next's hydrateRoot does", async () => {
  const sent: string[] = [];
  const root = createRoot({ window: 0 }, { send: (_w, json) => sent.push(json), onEvent() {}, call() {} });
  startTransition(() => root.render(<p>later</p>));
  await vi.waitFor(() => expect(sent.map(s => JSON.parse(s))).toEqual([{ root: { t: "p", a: {}, c: ["later"] } }]));
});

test("an error in a render outside an event is reported, not lost", async () => {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
  try {
    function Later() {
      const [boom, setBoom] = useState(false);
      useEffect(() => void setTimeout(() => setBoom(true), 0), []);
      if (boom) throw new Error("boom later");
      return <p>ok</p>;
    }
    createRoot({ window: 0 }, { send() {}, onEvent() {}, call() {} }).render(<Later />);
    await vi.waitFor(() => expect(errors.flat().map(String).join(" ")).toContain("boom later"));
  } finally {
    spy.mockRestore();
  }
});
