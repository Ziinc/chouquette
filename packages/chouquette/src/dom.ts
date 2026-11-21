// The rest of react-dom's API, as Next.js's client runtime and libraries
// use it, over chouquette's root: no DOM, so portals and resource hints
// render nothing.
import { type ReactNode, useActionState, version } from "react";
import { reconciler } from "./host-config";
import { createRoot, type Root, type RootOptions } from "./root";

export { version };

/**
 * React's hydrateRoot: there is no server HTML to hydrate, so it renders
 * `children` afresh, into window 0 (the container names a DOM node).
 */
export function hydrateRoot(_container: unknown, children: ReactNode, _options?: unknown): Root {
  const root = createRoot({ window: 0 } satisfies RootOptions);
  root.render(children);
  return root;
}

export const flushSync = <R>(fn?: () => R): R => reconciler.flushSyncFromReconciler(fn ?? (() => undefined as R));

export const unstable_batchedUpdates = <A, R>(fn: (a: A) => R, a: A): R => fn(a);

/** Portals target DOM nodes, which chouquette has none of: they render nothing. */
export const createPortal = (_children: ReactNode, _container: unknown, _key?: string | null) => null;

// Resource hints: stylesheets, scripts and fonts mean nothing to GPUI.
export const preload = (_href: string, _options?: unknown) => undefined;
export const preloadModule = (_href: string, _options?: unknown) => undefined;
export const preinit = (_href: string, _options?: unknown) => undefined;
export const preinitModule = (_href: string, _options?: unknown) => undefined;
export const preconnect = (_href: string, _options?: unknown) => undefined;
export const prefetchDNS = (_href: string) => undefined;

// Form hooks: forms submit through the host (onSubmit, action), never pending.
export const useFormState = useActionState;
export const useFormStatus = () => ({ pending: false, data: null, method: null, action: null });
export const requestFormReset = (_form: unknown) => undefined;
