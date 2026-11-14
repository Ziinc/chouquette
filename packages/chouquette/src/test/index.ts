// chouquette/test: render components headlessly and drive them as a user would.
import type { ReactNode } from "react";
import { afterEach, expect } from "vitest";
import { setHost } from "../host";
import { createRoot, type Root, type Theme } from "../root";
import type { Element, Node } from "../wire";
import { HeadlessHost } from "./headless-host";
import {
  describe, entries, type Entry, type HostElement, isTextInput, type Matcher, matches, nameOf, roleOf, textOf,
} from "./queries";

export { HeadlessHost } from "./headless-host";
export type { HostElement, Matcher } from "./queries";

type Rendered = { host: HeadlessHost; roots: Root[]; window: number };
let current: Rendered | null = null;

/** Unmounts what `render` rendered; runs after every test. */
export function cleanup() {
  current?.roots.forEach(root => root.unmount());
  current = null;
  setHost(undefined);
}
afterEach(cleanup);

/**
 * Renders `ui` into a headless window (0 by default), unmounting the last
 * render. Platform calls go to the same headless host, whose state
 * (clipboard, windows, menus) tests can read.
 */
export function render(ui: ReactNode, { window = 0, theme }: { window?: number; theme?: Theme } = {}) {
  cleanup();
  const host = new HeadlessHost();
  setHost(host);
  const root = createRoot({ window, theme }, host);
  current = { host, roots: [root], window };
  root.render(ui);
  return {
    host,
    rerender: (next: ReactNode) => root.render(next),
    unmount: () => root.unmount(),
    /** Renders into another window of the same host, as `createRoot({ window })` does. */
    renderWindow(window: number, next: ReactNode) {
      const other = createRoot({ window }, host);
      current!.roots.push(other);
      other.render(next);
    },
  };
}

function rendered(): Rendered {
  if (!current) throw new Error("render something first");
  return current;
}

/** The tree last drawn in `window`, each `<list>` holding the rows the host has, as Baguette.Test.tree. */
export function tree(window = rendered().window): Node {
  const { host } = rendered();
  const lists = host.rows.get(window);
  const withRows = (node: Node): Node => {
    if (!node || typeof node === "string") return node;
    if (node.t === "list") {
      const count = Number(node.a.rows ?? 0);
      const rows = [...(lists?.get(node.a.id) ?? new Map())].filter(([i]) => i < count).sort(([a], [b]) => a - b);
      return { ...node, c: rows.map(([, row]) => row) };
    }
    const c = node.c.map(withRows);
    if (c.every((child, i) => child === node.c[i])) return node;
    // Rows are copies of lists' children; keep the rest of the tree as drawn.
    node.c.splice(0, node.c.length, ...c);
    return node;
  };
  return withRows(host.trees.get(window) ?? null);
}

function all(scope?: HostElement): Entry[] {
  const window = scope?.window ?? rendered().window;
  const list = entries(tree(window));
  return scope ? list.filter(e => e.path === scope.path || e.path.startsWith(`${scope.path}.`)) : list;
}

const at = (window: number, e: Entry): HostElement => ({ window, path: e.path, node: e.node });

function queries(scope?: HostElement) {
  const window = () => scope?.window ?? rendered().window;
  const find = (pred: (e: Entry) => boolean) => all(scope).filter(pred).map(e => at(window(), e));
  const innermost = (found: HostElement[]) => found.filter(f => !found.some(o => o !== f && o.path.startsWith(`${f.path}.`)));
  const byRole = (role: string, { name }: { name?: Matcher } = {}) =>
    find(e => roleOf(e.node) === role && (name === undefined || matches(nameOf(e.node), name)));
  const byText = (text: Matcher) => innermost(find(e => matches(textOf(e.node), text)));
  const byLabel = (label: Matcher) => find(e => matches(e.node.a["aria-label"], label));
  const byPlaceholder = (text: Matcher) => find(e => matches(e.node.a.placeholder, text));
  const one = (found: HostElement[], what: string) => {
    if (found.length !== 1) throw new Error(`${found.length ? "more than one" : "no"} element ${what} in window ${window()}`);
    return found[0];
  };
  const maybe = (found: HostElement[], what: string) => (found.length ? one(found, what) : null);
  const roleWhat = (role: string, o: { name?: Matcher } = {}) => `with role ${role}${o.name !== undefined ? ` named ${describe(o.name)}` : ""}`;
  return {
    getByRole: (role: string, o: { name?: Matcher } = {}) => one(byRole(role, o), roleWhat(role, o)),
    queryByRole: (role: string, o: { name?: Matcher } = {}) => maybe(byRole(role, o), roleWhat(role, o)),
    getAllByRole: (role: string, o: { name?: Matcher } = {}) => byRole(role, o),
    getByText: (text: Matcher) => one(byText(text), `with text ${describe(text)}`),
    queryByText: (text: Matcher) => maybe(byText(text), `with text ${describe(text)}`),
    getAllByText: (text: Matcher) => byText(text),
    getByLabelText: (label: Matcher) => one(byLabel(label), `labelled ${describe(label)}`),
    queryByLabelText: (label: Matcher) => maybe(byLabel(label), `labelled ${describe(label)}`),
    getByPlaceholderText: (text: Matcher) => one(byPlaceholder(text), `with placeholder ${describe(text)}`),
    /** All text inside, joined by spaces. */
    text: () => (scope ? textOf(scope.node) : textOf(tree(window()))),
    /** The names of the `<icon>`s inside, in order. */
    icons: () => all(scope).filter(e => e.node.t === "icon").map(e => e.node.a.name),
    /** The labels of the elements with a `tabIndex`, in the order Tab visits them. */
    focusOrder: () =>
      all(scope)
        .filter(e => e.node.a.tabindex !== undefined)
        .sort((a, b) => Number(a.node.a.tabindex) - Number(b.node.a.tabindex))
        .map(e => e.node.a["aria-label"] ?? textOf(e.node)),
  };
}

/** Queries over the last rendered window. */
export const screen = {
  ...queries(),
  /** Queries over another window of the same host. */
  window: (window: number) => queries({ window, path: "root", node: tree(window) as Element }),
};

/** Queries inside `el`. */
export const within = (el: HostElement) => queries(el);

/** Lets platform replies and the renders they cause settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

function entryOf(el: HostElement): Entry {
  const found = entries(tree(el.window)).find(e => e.path === el.path);
  if (!found || found.node.t !== el.node.t) throw new Error(`<${el.node.t}> at ${el.path} is no longer rendered`);
  return found;
}

const phxValues = (el: Element) =>
  Object.fromEntries(Object.entries(el.a).filter(([k]) => k.startsWith("phx-value-")).map(([k, v]) => [k.slice(10), v]));

function currentValue(window: number, path: string, el: Element) {
  const rendered = el.a.value ?? "";
  const typed = rendered_().host.typed.get(window)?.get(path);
  return typed && typed.rendered === rendered ? typed.text : rendered;
}
const rendered_ = rendered;

/** The named values a form submits: each text input's text, "on" for each checked checkbox. */
function formValues(window: number, form: NonNullable<Entry["form"]>) {
  const values: Record<string, string> = {};
  for (const e of entries(tree(window))) {
    if (e.form?.path !== form.path || e.node.t !== "input" && e.node.t !== "textarea") continue;
    const name = e.node.a.name;
    if (!name) continue;
    if (e.node.a.type === "checkbox") {
      if ("checked" in e.node.a) values[name] = "on";
    } else values[name] = currentValue(window, e.path, e.node);
  }
  return values;
}

async function dispatch(window: number, type: string, event: string, values: Record<string, unknown>, extra = {}) {
  rendered().host.dispatch({ type, window, event, values, ...extra });
  await settle();
}

async function submitForm(window: number, form: NonNullable<Entry["form"]>) {
  const event = form.node.a["phx-submit"];
  if (!event) throw new Error("the form has no onSubmit");
  await dispatch(window, "submit", event, formValues(window, form));
}

type Mods = { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean };

export const user = {
  /** Clicks `el`: its onClick (a checkbox toggles), or a submit button submits its form. */
  async click(el: HostElement) {
    const { node, form } = entryOf(el);
    if (node.a["phx-click"]) {
      const values: Record<string, unknown> = phxValues(node);
      if (node.t === "input" && node.a.type === "checkbox") values.checked = !("checked" in node.a);
      return dispatch(el.window, "click", node.a["phx-click"], values);
    }
    if (node.t === "button" && node.a.type === "submit" && form) return submitForm(el.window, form);
    throw new Error(`<${node.t}> ${JSON.stringify(nameOf(node))} is not clickable`);
  },

  /** Types `text` into a text input, replacing what was there; its onChange or its form's runs. */
  async fill(el: HostElement, text: string) {
    const { node, path, form } = entryOf(el);
    if (!isTextInput(node)) throw new Error(`<${node.t}> is not a text input`);
    rendered().host.type(el.window, path, text, node.a.value ?? "");
    const name = node.a.name ?? "value";
    const event = node.a["phx-change"] ?? form?.node.a["phx-change"];
    const values = form ? formValues(el.window, form) : { [name]: text };
    if (event) await dispatch(el.window, "change", event, { ...values, _target: name });
  },

  clear: (el: HostElement) => user.fill(el, ""),

  /** Submits the form `el` is, or is in, as pressing Enter in it does. */
  async submit(el: HostElement) {
    const { node, path, form } = entryOf(el);
    const target = node.t === "form" ? { path, node } : form;
    if (!target) throw new Error(`no form around <${node.t}>`);
    await submitForm(el.window, target);
  },

  /**
   * Presses `key` (`"d"`, `"Enter"`, `"ArrowUp"`) with modifiers: every
   * onWindowKeyDown whose windowKey matches gets it. With `focus`, a text
   * input has focus and keeps keys it handles itself: only Ctrl or Meta
   * chords reach the window, and not Ctrl/Meta with A, C, V, X, Y or Z.
   */
  async keydown(key: string, { focus, ...mods }: Mods & { focus?: HostElement } = {}) {
    const window = focus?.window ?? rendered().window;
    const flags = { ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt, meta: !!mods.meta };
    const bindings = entries(tree(window)).filter(e => e.node.a["phx-window-keydown"]);
    if (!bindings.length) throw new Error(`no onWindowKeyDown in window ${window}`);
    if (focus) {
      entryOf(focus);
      const chord = flags.ctrl || flags.meta;
      if (!chord || (["a", "c", "v", "x", "y", "z"].includes(key.toLowerCase()) && !flags.shift)) return settle();
    }
    for (const { node } of bindings) {
      const filter = node.a["phx-key"];
      if (filter === undefined || filter.toLowerCase() === key.toLowerCase())
        rendered().host.dispatch({ type: "keydown", window, event: node.a["phx-window-keydown"], values: { ...phxValues(node), ...flags, key } });
    }
    await settle();
  },

  /**
   * Presses `keys` (GPUI's syntax, as useKeymap names them): the binding
   * for the `keyContext` nearest the focused element wins, then one without.
   */
  async keystroke(keys: string, { focus }: { focus?: HostElement } = {}) {
    const window = focus?.window ?? rendered().window;
    const all = entries(tree(window));
    const contexts = focus
      ? all
          .filter(e => e.node.a["key-context"] && (focus.path === e.path || focus.path.startsWith(`${e.path}.`)))
          .reverse()
          .map(e => e.node.a["key-context"])
      : [];
    const bindings = (rendered().host.keymaps.get(window) ?? []).filter(b => b.keys === keys);
    const binding = contexts.map(c => bindings.find(b => b.context === c)).find(Boolean) ?? bindings.find(b => !b.context);
    if (binding) rendered().host.dispatch({ type: "action", window, action: binding.action });
    await settle();
  },

  /** Drags `el` by `dx`, `dy` pixels. */
  async drag(el: HostElement, dx: number, dy: number) {
    const { node } = entryOf(el);
    if (!node.a["phx-drag"]) throw new Error(`<${node.t}> is not draggable`);
    await dispatch(el.window, "drag", node.a["phx-drag"], phxValues(node), { dx, dy });
  },

  /** Chooses `path` in the file picker `el` opens (onPickFile or onPickSave). */
  async pickFile(el: HostElement, path: string) {
    const { node } = entryOf(el);
    const event = node.a["phx-pick-file"] ?? node.a["phx-pick-save"];
    if (!event) throw new Error(`<${node.t}> opens no file picker`);
    await dispatch(el.window, "pick", event, { ...phxValues(node), path });
  },

  /** Scrolls rows `first` to `last` of the `<List>` named `id` into view. */
  async showRows(id: string, first: number, last: number, window = rendered().window) {
    const list = entries(tree(window)).find(e => e.node.t === "list" && e.node.a.id === id);
    if (!list) throw new Error(`no list ${JSON.stringify(id)} in window ${window}`);
    await dispatch(window, "rows", list.node.a["phx-rows"], {}, { id, start: first, end: last + 1, visible: [first, last + 1] });
  },
};

const hidden = (el: Element) => el.a.hidden !== undefined || (el.a.class ?? "").split(/\s+/).includes("hidden");

function visible(window: number, path: string) {
  let node: Node = tree(window);
  if (!node || typeof node === "string" || hidden(node)) return false;
  for (const i of path.split(".").slice(1).map(Number)) {
    node = (node as Element).c[i];
    if (!node || typeof node === "string" || hidden(node)) return false;
  }
  return true;
}

function live(el: HostElement): Element | null {
  return entries(tree(el.window)).find(e => e.path === el.path && e.node.t === el.node.t)?.node ?? null;
}

expect.extend({
  toBeVisible(received: HostElement) {
    const node = live(received);
    const pass = !!node && textOf(node) === textOf(received.node) && visible(received.window, received.path);
    return { pass, message: () => `expected <${received.node.t}> ${pass ? "not " : ""}to be visible` };
  },
  toHaveValue(received: HostElement, expected: string) {
    const node = live(received);
    const value = node ? currentValue(received.window, received.path, node) : undefined;
    return { pass: value === expected, message: () => `expected value ${JSON.stringify(expected)}, got ${JSON.stringify(value)}` };
  },
  toBeChecked(received: HostElement) {
    const node = live(received);
    const pass = !!node && ("checked" in node.a || node.a["aria-checked"] === "true");
    return { pass, message: () => `expected <${received.node.t}> ${pass ? "not " : ""}to be checked` };
  },
});

declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toBeVisible(): R;
    toHaveValue(value: string): R;
    toBeChecked(): R;
  }
}
