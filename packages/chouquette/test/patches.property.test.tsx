// Property: for any two React trees, the patch the reconciler sends for the
// re-render, applied to the first frame, gives the second frame — with
// keyed and unkeyed children, adjacent text and attribute changes.
import fc from "fast-check";
import { createElement, type ReactNode } from "react";
import { expect, test } from "vitest";
import { createRoot } from "../src/root";
import { applyPatch, type Node, type Op } from "../src/wire";

type Tree = { tag: string; cls?: string; title?: string; keyed: boolean; children: (Tree | string | number | null)[] };

const tree: fc.Arbitrary<Tree> = fc.letrec<{ tree: Tree }>(tie => ({
  tree: fc.record({
    tag: fc.constantFrom("div", "p", "ul", "li", "text"),
    cls: fc.option(fc.constantFrom("a", "b", "p-2"), { nil: undefined }),
    title: fc.option(fc.constantFrom("x", "y"), { nil: undefined }),
    keyed: fc.boolean(),
    children: fc.array(
      fc.oneof({ depthSize: "small", withCrossShrink: true },
        fc.constantFrom("a", "b", " ", "cd"), fc.integer({ min: 0, max: 9 }), fc.constant(null), tie("tree") as fc.Arbitrary<Tree>),
      { maxLength: 4 },
    ),
  }),
})).tree;

// Keys from a small set, so trees share some and differ in others.
function element(t: Tree, key?: string): ReactNode {
  const children = t.children.map((c, i) =>
    c !== null && typeof c === "object" ? element(c, t.keyed ? `${c.tag}${c.children.length}${i % 2}` : undefined) : c,
  );
  const keys = new Set<string>();
  // Duplicate keys are a React error, not a case to test: drop them.
  const unique = children.filter((c: any) => !c?.key || (!keys.has(c.key) && (keys.add(c.key), true)));
  return createElement(t.tag, { key, className: t.cls, title: t.title }, ...unique);
}

test("a re-render's patch turns the old frame into the new", () => {
  fc.assert(
    fc.property(tree, tree, (a, b) => {
      const sent: { root?: Node; patch?: Op[] }[] = [];
      const root = createRoot({ window: 0 }, { send: (_w, j) => sent.push(JSON.parse(j)), onEvent() {}, call() {} });
      root.render(element(a));
      const before = structuredClone(sent[0].root!);
      sent.length = 0;
      root.render(element(b));
      const after = (() => {
        const fresh: { root?: Node }[] = [];
        createRoot({ window: 0 }, { send: (_w, j) => fresh.push(JSON.parse(j)), onEvent() {}, call() {} }).render(element(b));
        return fresh[0].root;
      })();
      const patched = sent.reduce<Node>((t, m) => (m.root !== undefined ? m.root : applyPatch(t, m.patch ?? [])), before);
      expect(patched).toEqual(after);
    }),
    { numRuns: 300 },
  );
});
