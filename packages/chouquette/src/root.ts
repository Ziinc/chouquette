import { createElement, type ReactNode } from "react";
import { ConcurrentRoot, DiscreteEventPriority } from "react-reconciler/constants.js";
import { type Binding, type RootApi, RootContext } from "./context";
import { syntheticEvent } from "./events";
import { getHost, type Transport } from "./host";
import { type RootContainer, type RowsContainer, getPriority, reconciler, serialize, setPriority } from "./host-config";
import type { Appearance } from "./platform";
import { handlersFor } from "./props";
import type { HostEvent, Node } from "./wire";

export type { Transport } from "./host";

export type Root = { render(children: ReactNode): void; unmount(): void };

/** Theme tokens, named in classes as `bg-<token>`: one colour, or one per appearance. */
export type Theme = Record<string, string | { light: string; dark: string }>;

export type RootOptions = { window: number; theme?: Theme };

export function createRoot({ window, theme }: RootOptions, transport: Transport = getHost()): Root {
  let sent = false;
  let full = false;
  let appearance: Appearance = "light";
  let keymapSent = "[]";
  const errors: unknown[] = [];
  const bindings = new Map<string, Binding>();
  const appearanceListeners = new Set<() => void>();
  const lists = new Map<string, RowsContainer>();

  const send = (message: unknown) => transport.send(window, JSON.stringify(message));
  const rootNode = (): Node => (container.children[0] ? serialize(container.children[0]) : null);
  const keymap = () =>
    [...bindings].map(([action, b]) => (b.context ? { keys: b.keys, action, context: b.context } : { keys: b.keys, action }));
  const tokens = (t: Theme) =>
    Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === "string" ? v : v[appearance]]));

  function frame() {
    const km = keymap();
    keymapSent = JSON.stringify(km);
    full = false;
    send({ root: rootNode(), ...(theme && { theme: tokens(theme) }), ...(km.length && { keymap: km }) });
  }
  const sendRows = (rows: RowsContainer) =>
    send({ rows: { id: rows.id, start: rows.start, rows: rows.children.map(serialize) } });

  const container: RootContainer = {
    kind: "root",
    children: [],
    ops: [],
    dirty: new Set(),
    nextId: 1,
    handlers: new Map(),
    commit(ops, rows) {
      if (!sent) {
        if (!container.children[0]) return;
        sent = true;
        frame();
      } else if (full || JSON.stringify(keymap()) !== keymapSent) frame();
      else if (ops.length) send({ patch: ops });
      rows.forEach(sendRows);
    },
  };

  const api: RootApi = {
    window,
    bind: (action, binding) => void bindings.set(action, binding),
    unbind: action => void bindings.delete(action),
    appearance: () => appearance,
    subscribeAppearance(listener) {
      appearanceListeners.add(listener);
      return () => void appearanceListeners.delete(listener);
    },
    rows(id) {
      let rows = lists.get(id);
      if (!rows) lists.set(id, (rows = { kind: "rows", id, start: 0, children: [], root: container }));
      return rows;
    },
  };

  const onError = (error: unknown) => errors.push(error);
  const fiberRoot = reconciler.createContainer(
    container, ConcurrentRoot, null, false, null, "", onError, onError, onError, () => {}, null,
  );

  const flush = (fn: () => void) => {
    fn();
    reconciler.flushSyncWork();
    // A binding added or removed without a commit, or a theme change.
    if (sent && (full || JSON.stringify(keymap()) !== keymapSent)) frame();
    if (errors.length) throw errors.splice(0)[0];
  };

  const discrete = (fn: () => void) => {
    const previous = getPriority();
    setPriority(DiscreteEventPriority);
    try {
      flush(fn);
    } finally {
      setPriority(previous);
    }
  };

  transport.onEvent(event => {
    if (event.window !== window) return;
    switch (event.type) {
      // The host couldn't apply a patch: it gets the whole frame.
      case "resync":
        if (sent) {
          frame();
          lists.forEach(rows => rows.children.length && sendRows(rows));
        }
        return;
      case "appearance": {
        const next = (event as { appearance?: string }).appearance === "dark" ? "dark" : "light";
        if (next === appearance) return;
        appearance = next;
        if (theme) full = true;
        return discrete(() => appearanceListeners.forEach(l => l()));
      }
      case "action": {
        const binding = bindings.get((event as { action?: string }).action ?? "");
        return binding && discrete(() => binding.run.current());
      }
    }
    const inst = event.event ? container.handlers.get(event.event) : undefined;
    if (!inst) return;
    const calls = handlersFor(inst.type, event.type, inst.props).filter(([prop]) => typeof inst.props[prop] === "function");
    if (calls.length)
      discrete(() => {
        for (const [prop, type] of calls) (inst.props[prop] as (e: unknown) => void)(type === "rows" ? event : syntheticEvent(type, event));
      });
  });

  const render = (children: ReactNode) =>
    flush(() => reconciler.updateContainerSync(createElement(RootContext.Provider, { value: api }, children), fiberRoot, null, null));

  return { render, unmount: () => flush(() => reconciler.updateContainerSync(null, fiberRoot, null, null)) };
}
