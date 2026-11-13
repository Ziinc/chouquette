// The wire format levain's host draws, as baguette sends it.

/** A node is text or an element: tag, attributes, children. */
export type Node = string | Element | null;
export type Element = { t: string; a: Record<string, string>; c: Node[] };

/** `at` is the path from the root to a node, as child indices. */
export type Op =
  | { op: "replace"; at: number[]; node: Node }
  | { op: "attrs"; at: number[]; a: Record<string, string> }
  | { op: "splice"; at: number[]; start: number; delete: number; c: Node[] };

/** A window's first frame carries `root`; later ones carry `patch`. */
export type Frame = { root?: Node; patch?: Op[] };

/** What the host sends back, e.g. `{type: "click", window: 0, event: "h1", values: {}}`. */
export type HostEvent = { type: string; window: number; event?: string; values?: Record<string, unknown> };

/** Applies `patch` to `tree` in place, as the host does, and returns the new root. */
export function applyPatch(tree: Node, patch: Op[]): Node {
  for (const op of patch) {
    if (op.at.length === 0 && op.op === "replace") {
      tree = op.node;
      continue;
    }
    const path = op.op === "replace" ? op.at.slice(0, -1) : op.at;
    const el = path.reduce((n, i) => (n as Element).c[i], tree) as Element;
    if (op.op === "replace") el.c[op.at.at(-1)!] = op.node;
    else if (op.op === "attrs") el.a = op.a;
    else el.c.splice(op.start, op.delete, ...op.c);
  }
  return tree;
}
