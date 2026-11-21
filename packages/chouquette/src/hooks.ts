import { useContext, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { RootContext, type RootApi } from "./context";
import type { Appearance } from "./platform";

function useRoot(): RootApi {
  const root = useContext(RootContext);
  if (!root) throw new Error("chouquette hooks need a chouquette root (createRoot)");
  return root;
}

/**
 * Binds `keys` (GPUI's syntax: `secondary-` is Cmd on macOS and Ctrl
 * elsewhere) to `run`, while focus is inside an element whose `keyContext`
 * is `context`, or anywhere without one.
 */
export function useKeymap(keys: string, run: () => void, { context }: { context?: string } = {}) {
  const root = useRoot();
  const action = `k${useId()}`;
  const latest = useRef(run);
  latest.current = run;
  // Bound during render, so the frame of this very commit carries it.
  root.bind(action, { keys, context, run: latest });
  useEffect(() => () => root.unbind(action), [root, action]);
}

/** The window's appearance, `light` or `dark`, as the host reports it. */
export function useAppearance(): Appearance {
  const root = useRoot();
  return useSyncExternalStore(root.subscribeAppearance, root.appearance);
}
