// The props levain's elements take beyond the DOM's.
import type { HostSyntheticEvent } from "./events";

declare module "react" {
  interface DOMAttributes<T> {
    /** A key pressed anywhere in the window (`phx-window-keydown`); `windowKey` filters it. */
    onWindowKeyDown?: (e: HostSyntheticEvent) => void;
    windowKey?: string;
    /** Opens the native file picker; the event has the chosen `path`. */
    onPickFile?: (e: HostSyntheticEvent) => void;
    /** Opens the native save dialog; the event has the chosen `path`. */
    onPickSave?: (e: HostSyntheticEvent) => void;
    defaultName?: string;
    /** Names the context `useKeymap(..., { context })` bindings fire in. */
    keyContext?: string;
  }
}
