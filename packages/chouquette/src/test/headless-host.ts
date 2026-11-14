// The host without a GPU: applies frames, patches and rows to a tree per
// window, answers platform calls from memory, and sends events back as the
// native host does.
import type { Transport } from "../host";
import { applyPatch, type HostEvent, type Node } from "../wire";

type Message = { root?: Node; patch?: Parameters<typeof applyPatch>[1]; rows?: { id: string; start: number; rows: Node[] } };

export type HeadlessWindow = { title?: string; width?: number; height?: number; x?: number; y?: number };

export class HeadlessHost implements Transport {
  trees = new Map<number, Node>();
  /** Each list's rows the host has, by list id, then row index. */
  rows = new Map<number, Map<string, Map<number, Node>>>();
  clipboard: string | null = null;
  appearance: "light" | "dark" = "light";
  windows = new Map<number, HeadlessWindow>([[0, {}]]);
  menus: unknown[] = [];
  opened: string[] = [];
  exitCode: number | null = null;
  cliMatches: unknown = null;
  private listeners: ((event: HostEvent) => void)[] = [];

  send(window: number, json: string) {
    const message: Message = JSON.parse(json);
    if (message.rows) {
      const lists = this.rows.get(window) ?? new Map<string, Map<number, Node>>();
      this.rows.set(window, lists);
      const rows = lists.get(message.rows.id) ?? new Map<number, Node>();
      lists.set(message.rows.id, rows);
      message.rows.rows.forEach((row, i) => rows.set(message.rows!.start + i, row));
    } else if ("root" in message) this.trees.set(window, message.root ?? null);
    else if (message.patch) this.trees.set(window, applyPatch(this.trees.get(window) ?? null, message.patch));
  }

  onEvent(listener: (event: HostEvent) => void) {
    this.listeners.push(listener);
  }

  dispatch(event: HostEvent) {
    for (const listener of this.listeners) listener(event);
  }

  call(json: string) {
    const { call, ref, args } = JSON.parse(json) as { call: string; ref: number; args: Record<string, any> };
    let result: unknown = null;
    let error: string | undefined;
    switch (call) {
      case "clipboard.read":
        result = this.clipboard;
        break;
      case "clipboard.write":
        this.clipboard = args.text;
        break;
      case "app.appearance":
        result = this.appearance;
        break;
      case "app.open_url":
        this.opened.push(args.url);
        break;
      case "app.exit":
        this.exitCode = args.code ?? 0;
        break;
      case "menu.set":
        this.menus = args.menus;
        break;
      case "window.open":
        this.windows.set(args.window, { title: args.title, width: args.width ?? 800, height: args.height ?? 600 });
        break;
      case "window.close":
        this.windows.delete(args.window);
        break;
      case "window.set_title":
      case "window.set_bounds": {
        const w = this.windows.get(args.window);
        if (!w) error = `${call}: no such window`;
        else Object.assign(w, call === "window.set_title" ? { title: args.title } : args);
        break;
      }
      case "window.info": {
        const w = this.windows.get(args.window);
        result = w ? { title: w.title ?? "", x: w.x ?? 0, y: w.y ?? 0, width: w.width ?? 800, height: w.height ?? 600 } : null;
        break;
      }
      case "cli.matches":
        if (this.cliMatches) result = this.cliMatches;
        else error = "cli.matches: the app declares no cli";
        break;
      default:
        error = `${call}: no platform call \`${call}\``;
    }
    // The native host answers from its UI thread, after the call returns.
    queueMicrotask(() => this.dispatch({ type: "reply", ref, result, ...(error && { error }) }));
  }
}
