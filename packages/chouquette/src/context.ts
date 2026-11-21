import { createContext } from "react";
import type { RowsContainer } from "./host-config";
import type { Appearance } from "./platform";

export type Binding = { keys: string; context?: string; run: { current: () => void } };

/** What hooks and components need of the root they render in. */
export type RootApi = {
  window: number;
  bind(action: string, binding: Binding): void;
  unbind(action: string): void;
  appearance(): Appearance;
  subscribeAppearance(listener: () => void): () => void;
  rows(id: string): RowsContainer;
};

export const RootContext = createContext<RootApi | null>(null);
