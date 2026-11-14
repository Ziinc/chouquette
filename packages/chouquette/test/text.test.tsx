// Adjacent text React keeps apart (`At {x},{y}`) goes over the wire as one
// string, as baguette's trees have it: levain draws each string on its own.
import { useState } from "react";
import { expect, test } from "vitest";
import { createRoot } from "../src/root";
import type { HostEvent } from "../src/wire";

function mount(ui: React.ReactNode) {
  const frames: Record<string, any>[] = [];
  let emit: (e: HostEvent) => void = () => {};
  createRoot({ window: 0 }, { send: (_w, j) => frames.push(JSON.parse(j)), onEvent: l => (emit = l), call() {} }).render(ui);
  const click = () => emit({ type: "click", window: 0, event: frames[0].root.a["phx-click"], values: {} });
  return { frames, click };
}

test("adjacent text is one string, and an update replaces it whole", () => {
  function At() {
    const [x, setX] = useState(1);
    return <p onClick={() => setX(3)}>At {x},{2}</p>;
  }
  const { frames, click } = mount(<At />);
  expect(frames[0].root.c).toEqual(["At 1,2"]);
  click();
  expect(frames.at(-1)).toEqual({ patch: [{ op: "replace", at: [0], node: "At 3,2" }] });
});

test("text appearing next to text joins it", () => {
  function Maybe() {
    const [on, setOn] = useState(false);
    return <p onClick={() => setOn(true)}>a{on && "b"}<i />c</p>;
  }
  const { frames, click } = mount(<Maybe />);
  expect(frames[0].root.c).toEqual(["a", { t: "i", a: {}, c: [] }, "c"]);
  click();
  expect(frames.at(-1)).toEqual({ patch: [{ op: "replace", at: [], node: { t: "p", a: frames[0].root.a, c: ["ab", { t: "i", a: {}, c: [] }, "c"] } }] });
});

test("an element appearing between text splits it", () => {
  function Split() {
    const [on, setOn] = useState(false);
    return <p onClick={() => setOn(true)}>a{on && <i />}c<b /></p>;
  }
  const { frames, click } = mount(<Split />);
  expect(frames[0].root.c).toEqual(["ac", { t: "b", a: {}, c: [] }]);
  click();
  expect(frames.at(-1)).toEqual({
    patch: [{ op: "replace", at: [], node: { t: "p", a: frames[0].root.a, c: ["a", { t: "i", a: {}, c: [] }, "c", { t: "b", a: {}, c: [] }] } }],
  });
});

test("elements among elements still splice", () => {
  function Items() {
    const [n, setN] = useState(1);
    return <ul onClick={() => setN(2)}>{Array.from({ length: n }, (_, i) => <li key={i}>{`item ${i}`}</li>)}</ul>;
  }
  const { frames, click } = mount(<Items />);
  click();
  expect(frames.at(-1)).toEqual({ patch: [{ op: "splice", at: [], start: 1, delete: 0, c: [{ t: "li", a: {}, c: ["item 1"] }] }] });
});
