// The host without a GPU: applies frames and patches to a tree per window,
// and sends events back as the native host does.
import type { Transport } from "../root";
import { applyPatch, type Frame, type HostEvent, type Node } from "../wire";

export class HeadlessHost implements Transport {
  trees = new Map<number, Node>();
  private listeners: ((event: HostEvent) => void)[] = [];

  send(window: number, json: string) {
    const frame: Frame = JSON.parse(json);
    this.trees.set(window, frame.root !== undefined ? frame.root : applyPatch(this.trees.get(window) ?? null, frame.patch ?? []));
  }

  onEvent(listener: (event: HostEvent) => void) {
    this.listeners.push(listener);
  }

  dispatch(event: HostEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
