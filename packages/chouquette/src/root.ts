import type { ReactNode } from "react";
import { ConcurrentRoot, DiscreteEventPriority } from "react-reconciler/constants.js";
import { type Container, getPriority, reconciler, serialize, setPriority } from "./host-config";
import type { HostEvent } from "./wire";

/** How a root reaches the host: levain's runtime, or the headless host in tests. */
export type Transport = {
  send(window: number, json: string): void;
  onEvent(listener: (event: HostEvent) => void): void;
};

export type Root = { render(children: ReactNode): void; unmount(): void };

const eventProps: Record<string, string> = { click: "onClick" };

export function createRoot(
  { window }: { window: number },
  transport: Transport | undefined = (globalThis as { __chouquette_host?: Transport }).__chouquette_host,
): Root {
  if (!transport) throw new Error("no chouquette host: run the app in chouquette's host, or render it with chouquette/test");
  let sent = false;
  const errors: unknown[] = [];

  const container: Container = {
    children: [],
    ops: [],
    nextId: 1,
    handlers: new Map(),
    commit(ops, root) {
      if (!sent) {
        if (root === null) return;
        sent = true;
        transport.send(window, JSON.stringify({ root }));
      } else if (ops.length) transport.send(window, JSON.stringify({ patch: ops }));
    },
  };

  const onError = (error: unknown) => errors.push(error);
  const fiberRoot = reconciler.createContainer(
    container, ConcurrentRoot, null, false, null, "", onError, onError, onError, () => {}, null,
  );

  const flush = (fn: () => void) => {
    fn();
    reconciler.flushSyncWork();
    if (errors.length) throw errors.splice(0)[0];
  };

  transport.onEvent(event => {
    if (event.window !== window) return;
    // The host couldn't apply a patch: it gets the whole frame.
    if (event.type === "resync") {
      if (sent) transport.send(window, JSON.stringify({ root: container.children[0] ? serialize(container.children[0]) : null }));
      return;
    }
    if (!event.event) return;
    const handler = container.handlers.get(event.event)?.props[eventProps[event.type]];
    if (typeof handler !== "function") return;
    const previous = getPriority();
    setPriority(DiscreteEventPriority);
    try {
      flush(() => handler({ type: event.type, values: event.values ?? {}, preventDefault() {}, stopPropagation() {} }));
    } finally {
      setPriority(previous);
    }
  });

  return {
    render: children => flush(() => reconciler.updateContainerSync(children, fiberRoot, null, null)),
    unmount: () => flush(() => reconciler.updateContainerSync(null, fiberRoot, null, null)),
  };
}
