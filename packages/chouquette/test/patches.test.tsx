// Conformance with the shared patch fixtures: the ops React's mutations
// produce must equal the patch baguette's diff produces for the same trees.
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { applyPatch, type Frame, type Node, type Op } from "../src/wire";
import { createRoot } from "../src/root";
import fixtures from "./fixtures/patches.json";

// Each fixture's `old` and `new`, written as a React app would write them.
const cases: Record<string, [ReactNode, ReactNode]> = {
  "nothing changed": [<div className="p-2">hi</div>, <div className="p-2">hi</div>],
  "text in a child": [<div><text>Count: 1</text></div>, <div><text>Count: 2</text></div>],
  attributes: [<div className="a">x</div>, <div className="b" title="n">x</div>],
  "a child appended": [
    <ul>{["a", "b"].map(x => <li key={x}>{x}</li>)}</ul>,
    <ul>{["a", "b", "c"].map(x => <li key={x}>{x}</li>)}</ul>,
  ],
  "a child prepended": [
    <ul>{["b"].map(x => <li key={x}>{x}</li>)}</ul>,
    <ul>{["a", "b"].map(x => <li key={x}>{x}</li>)}</ul>,
  ],
  "a middle child removed": [
    <ul>{["a", "b", "c"].map(x => <li key={x}>{x}</li>)}</ul>,
    <ul>{["a", "c"].map(x => <li key={x}>{x}</li>)}</ul>,
  ],
  "a child changed and one added": [
    <div><text>1</text>{null}<hr /></div>,
    <div><text>2</text><p>new</p><hr /></div>,
  ],
  "another tag": [<div>x</div>, <section>x</section>],
  "another id is another element": [
    <div><div key="a" id="a">1</div></div>,
    <div><div key="b" id="b">1</div></div>,
  ],
  "deep change": [
    <div><div><text className="a">x</text></div>y</div>,
    <div><div><text className="b">x</text></div>y</div>,
  ],
  "from nothing": [null, <div>x</div>],
  "to nothing": [<div>x</div>, null],
};

type Fixture = { name: string; old: Node; new: Node; patch: Op[] };

test("every fixture has a case", () => {
  expect(Object.keys(cases).sort()).toEqual((fixtures as Fixture[]).map(f => f.name).sort());
});

for (const fixture of fixtures as Fixture[]) {
  test(fixture.name, () => {
    const frames: Frame[] = [];
    const root = createRoot({ window: 0 }, { send: (_w, json) => frames.push(JSON.parse(json)), onEvent: () => {} });
    const [oldEl, newEl] = cases[fixture.name];

    root.render(oldEl);
    const old = frames.length ? frames.at(-1)!.root ?? null : null;
    expect(old).toEqual(fixture.old);

    frames.length = 0;
    root.render(newEl);
    const patch = frames.flatMap((f): Op[] => f.patch ?? (f.root !== undefined ? [{ op: "replace", at: [], node: f.root }] : []));
    expect(patch).toEqual(fixture.patch);
    expect(applyPatch(structuredClone(fixture.old), patch)).toEqual(fixture.new);
  });
}
