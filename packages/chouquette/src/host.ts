// The host this JS context talks to: levain's runtime sets
// `globalThis.__chouquette_host`; tests set a headless one.
import type { HostEvent } from "./wire";

/** How chouquette reaches the host: levain's runtime, or the headless host in tests. */
export type Transport = {
  /** Renders a frame, patch or rows message to `window`. */
  send(window: number, json: string): void;
  /** Adds a listener for every event the host sends. */
  onEvent(listener: (event: HostEvent) => void): void;
  /** A platform call, `{"call", "ref", "args"}`; the host answers with a `reply` event. */
  call(json: string): void;
};

let current: Transport | undefined;

export function setHost(host: Transport | undefined) {
  current = host;
}

export function getHost(): Transport {
  const host = current ?? (globalThis as { __chouquette_host?: Transport }).__chouquette_host;
  if (!host) throw new Error("no chouquette host: run the app in chouquette's host, or render it with chouquette/test");
  return host;
}
