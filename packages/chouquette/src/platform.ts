// Platform calls (clipboard, windows, menus, the app), as Promises: each is a
// `{"call", "ref", "args"}` request the host answers with a `reply` event.
import { getHost, type Transport } from "./host";
import type { HostEvent } from "./wire";

type Pending = { resolve(value: unknown): void; reject(error: Error): void };
type State = { next: number; pending: Map<number, Pending>; menu: Map<string, () => void> };

const states = new WeakMap<Transport, State>();

function state(host: Transport): State {
  let s = states.get(host);
  if (!s) {
    const created: State = { next: 1, pending: new Map(), menu: new Map() };
    host.onEvent((event: HostEvent & { ref?: number; result?: unknown; error?: string }) => {
      if (event.type === "reply" && typeof event.ref === "number") {
        const pending = created.pending.get(event.ref);
        created.pending.delete(event.ref);
        if (event.error) pending?.reject(new Error(event.error));
        else pending?.resolve(event.result);
      } else if (event.type === "menu" && event.event) created.menu.get(event.event)?.();
    });
    states.set(host, (s = created));
  }
  return s;
}

/** Calls the platform: `name` with `args`; resolves with the host's result. */
export function call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const host = getHost();
  const s = state(host);
  const ref = s.next++;
  return new Promise<T>((resolve, reject) => {
    s.pending.set(ref, { resolve: resolve as (v: unknown) => void, reject });
    host.call(JSON.stringify({ call: name, ref, args }));
  });
}

const defined = (args: Record<string, unknown>) => Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));

export const clipboard = {
  read: () => call<string | null>("clipboard.read"),
  write: (text: string) => call<null>("clipboard.write", { text }),
};

export type Appearance = "light" | "dark";

export const app = {
  appearance: () => call<Appearance>("app.appearance"),
  openUrl: (url: string) => call<null>("app.open_url", { url }),
  /** Exits the process with `code` once the host has replied. */
  exit: (code?: number) => call<null>("app.exit", defined({ code })),
};

export type Bounds = { x?: number; y?: number; width?: number; height?: number };
export type WindowInfo = { title: string; x: number; y: number; width: number; height: number };

export const windows = {
  open: (window: number, opts: { title?: string; width?: number; height?: number } = {}) =>
    call<null>("window.open", defined({ window, ...opts })),
  close: (window: number) => call<null>("window.close", { window }),
  setTitle: (window: number, title: string) => call<null>("window.set_title", { window, title }),
  setBounds: (window: number, bounds: Bounds) => call<null>("window.set_bounds", defined({ window, ...bounds })),
  info: (window: number) => call<WindowInfo | null>("window.info", { window }),
};

export type MenuItem = { id: string; label: string; keys?: string; onSelect?: () => void } | { separator: true };
export type Menu = { title: string; items: MenuItem[] };

export const menu = {
  /** Sets the app's menu bar (desktop); an item's `onSelect` runs when it is chosen. */
  set(menus: Menu[]) {
    const s = state(getHost());
    s.menu.clear();
    const wire = menus.map(m => ({
      title: m.title,
      items: m.items.map(item => {
        if ("separator" in item) return item;
        const { onSelect, ...rest } = item;
        if (onSelect) s.menu.set(item.id, onSelect);
        return rest;
      }),
    }));
    return call<null>("menu.set", { menus: wire });
  },
};

export type CliMatches = {
  args: Record<string, { value: unknown; occurrences: number }>;
  subcommand: { name: string; matches: CliMatches } | null;
};

export const cli = {
  /** The parsed command line, for an app whose chouquette.json declares a `cli`. */
  matches: () => call<CliMatches>("cli.matches"),
};
