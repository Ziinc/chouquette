import { useState } from "react";
import { expect, test, vi } from "vitest";
import { List } from "../src/list";
import { createRoot } from "../src/root";
import type { HostEvent } from "../src/wire";

test("a List draws the rows the host asks for, and redraws them as state changes", async () => {
  const frames: Record<string, any>[] = [];
  let emit: (e: HostEvent) => void = () => {};
  let bump = () => {};
  function Feed() {
    const [suffix, setSuffix] = useState("");
    bump = () => setSuffix("!");
    return <List id="feed" rows={1000} rowHeight={20} className="h-96" renderRow={i => <p key={i}>{`row ${i}${suffix}`}</p>} />;
  }
  createRoot({ window: 0 }, { send: (_w, j) => frames.push(JSON.parse(j)), onEvent: l => (emit = l), call() {} }).render(<Feed />);

  const list = frames[0].root;
  expect(list).toEqual({ t: "list", a: { id: "feed", rows: "1000", "row-height": "20", class: "h-96", "phx-rows": expect.any(String) }, c: [] });

  emit({ type: "rows", window: 0, event: list.a["phx-rows"], id: "feed", start: 10, end: 12, visible: [10, 12] } as HostEvent);
  expect(frames.at(-1)).toEqual({ rows: { id: "feed", start: 10, rows: [{ t: "p", a: {}, c: ["row 10"] }, { t: "p", a: {}, c: ["row 11"] }] } });

  frames.length = 0;
  bump(); // outside an event: React renders it soon, not now
  await vi.waitFor(() => expect(frames).toEqual([{ rows: { id: "feed", start: 10, rows: [{ t: "p", a: {}, c: ["row 10!"] }, { t: "p", a: {}, c: ["row 11!"] }] } }]));
});
