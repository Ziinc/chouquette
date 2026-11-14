// chouquette/test: render components headlessly and drive them as a user would.
import type { ReactNode } from "react";
import { expect } from "vitest";
import { createRoot, type Root } from "../root";
import type { Element, Node } from "../wire";
import { HeadlessHost } from "./headless-host";
import { contains, type HostElement, queryAllByRole, queryAllByText } from "./queries";

export { HeadlessHost } from "./headless-host";
export type { HostElement } from "./queries";

let current: { host: HeadlessHost; root: Root; window: number } | null = null;

/** Renders `ui` into a headless window, unmounting the last one rendered. */
export function render(ui: ReactNode, { window = 0 }: { window?: number } = {}) {
  current?.root.unmount();
  const host = new HeadlessHost();
  const root = createRoot({ window }, host);
  root.render(ui);
  current = { host, root, window };
  return { host, rerender: (next: ReactNode) => root.render(next), unmount: () => root.unmount() };
}

function screenTree(): { tree: Node; window: number } {
  if (!current) throw new Error("render something first");
  return { tree: current.host.trees.get(current.window) ?? null, window: current.window };
}

function one(found: Element[], what: string): HostElement {
  if (found.length !== 1) throw new Error(`${found.length === 0 ? "no" : "more than one"} element ${what}`);
  return { window: screenTree().window, node: found[0] };
}

export const screen = {
  getByRole: (role: string, opts: { name?: string } = {}) =>
    one(queryAllByRole(screenTree().tree, role, opts), `with role ${role}${opts.name !== undefined ? ` named ${JSON.stringify(opts.name)}` : ""}`),
  getByText: (text: string) => one(queryAllByText(screenTree().tree, text), `with text ${JSON.stringify(text)}`),
};

const values = (el: Element) =>
  Object.fromEntries(Object.entries(el.a).filter(([k]) => k.startsWith("phx-value-")).map(([k, v]) => [k.slice(10), v]));

export const user = {
  /** Clicks `el`, sending its `phx-click` event as the host does. */
  async click({ window, node }: HostElement) {
    const event = node.a["phx-click"];
    if (!event) throw new Error(`<${node.t}> is not clickable`);
    current!.host.dispatch({ type: "click", window, event, values: values(node) });
  },
};

const hidden = (el: Element) => el.a.hidden !== undefined || (el.a.class ?? "").split(/\s+/).includes("hidden");

function visibleIn(node: Node, target: Element): boolean {
  if (!node || typeof node === "string" || hidden(node)) return false;
  return node === target || node.c.some(c => visibleIn(c, target));
}

expect.extend({
  toBeVisible(received: HostElement) {
    const tree = current?.host.trees.get(received.window) ?? null;
    const pass = visibleIn(tree, received.node);
    return {
      pass,
      message: () => `expected <${received.node.t}> ${pass ? "not " : ""}to be visible${contains(tree, received.node) ? "" : " (it is no longer rendered)"}`,
    };
  },
});

declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toBeVisible(): R;
  }
}
