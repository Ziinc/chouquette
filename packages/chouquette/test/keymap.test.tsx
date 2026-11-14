import { useState } from "react";
import { expect, test } from "vitest";
import { useKeymap } from "../src/hooks";
import { createRoot } from "../src/root";
import type { HostEvent } from "../src/wire";

test("useKeymap sends bindings in the frame and runs on its action", () => {
  const frames: Record<string, any>[] = [];
  let emit: (e: HostEvent) => void = () => {};
  function Counter() {
    const [n, setN] = useState(0);
    useKeymap("secondary-r", () => setN(0));
    useKeymap("secondary-k", () => setN(n + 1), { context: "Jobs" });
    return <p keyContext="Jobs">{n}</p>;
  }
  createRoot({ window: 0 }, { send: (_w, j) => frames.push(JSON.parse(j)), onEvent: l => (emit = l), call() {} }).render(<Counter />);

  const keymap = frames.at(-1)!.keymap;
  expect(keymap).toEqual([
    { keys: "secondary-r", action: expect.any(String) },
    { keys: "secondary-k", action: expect.any(String), context: "Jobs" },
  ]);
  expect(frames.at(-1)!.root.a).toEqual({ "key-context": "Jobs" });

  emit({ type: "action", window: 0, action: keymap[1].action } as HostEvent);
  emit({ type: "action", window: 0, action: keymap[1].action } as HostEvent);
  expect(frames.at(-1)).toEqual({ patch: [{ op: "replace", at: [0], node: "2" }] });
  emit({ type: "action", window: 0, action: keymap[0].action } as HostEvent);
  expect(frames.at(-1)).toEqual({ patch: [{ op: "replace", at: [0], node: "0" }] });
});
