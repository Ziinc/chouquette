/// <reference path="./components/gpui-kit.d.ts" />
// The props levain's elements take beyond the DOM's.
import type { HostSyntheticEvent } from "./events";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      /** A lucide icon by name. */
      icon: { name: string; className?: string; "aria-label"?: string; animate?: string; key?: React.Key };
      /** A virtualized list's host element; use `<List>`. */
      list: Record<string, unknown>;
    }
  }
  interface DOMAttributes<T> {
    /** A key pressed anywhere in the window (`phx-window-keydown`); `windowKey` filters it. */
    onWindowKeyDown?: (e: HostSyntheticEvent) => void;
    windowKey?: string;
    /** Opens the native file picker; the event has the chosen `path`. */
    onPickFile?: (e: HostSyntheticEvent) => void;
    /** Opens the native save dialog; the event has the chosen `path`. */
    onPickSave?: (e: HostSyntheticEvent) => void;
    defaultName?: string;
    /** File types the picker offers, comma-separated extensions (`csv,xlsx`). */
    accept?: string;
    /** A drag of the element ended `dx`, `dy` pixels from where it started (`phx-drag`). */
    onDragBy?: (e: HostSyntheticEvent & { dx: number; dy: number }) => void;
    /** Animation (levain's animation.rs): classes to tween between, and a preset. */
    "animate-from"?: string;
    "animate-to"?: string;
    animate?: string;
    duration?: number | string;
    delay?: number | string;
    easing?: string;
    repeat?: number | string;
    direction?: string | number;
    /** Names the context `useKeymap(..., { context })` bindings fire in. */
    keyContext?: string;
  }

  interface SVGAttributes<T> {
    /** A `<line>` drawn as a curve. */
    curve?: boolean | "";
  }
}
