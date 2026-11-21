import { createElement, Fragment, type ReactNode, useContext, useState } from "react";
import { RootContext } from "./context";
import { reconciler } from "./host-config";

export type ListProps = {
  /** Names the list; unique in its window. */
  id: string;
  /** How many rows there are. */
  rows: number;
  /** One row; only those on screen are rendered. */
  renderRow(index: number): ReactNode;
  /** Pixels a row is tall until the host has measured one (default 24). */
  rowHeight?: number;
  className?: string;
};

/**
 * A virtualized list: the host draws only the rows on screen and asks for
 * them by range; they render through a portal with the app's state and context.
 */
export function List({ id, rows, renderRow, rowHeight, className }: ListProps) {
  const root = useContext(RootContext);
  if (!root) throw new Error("List needs a chouquette root (createRoot)");
  const [range, setRange] = useState<[number, number] | null>(null);
  const container = root.rows(id);
  const list = createElement("list", {
    id,
    rows,
    rowHeight,
    className,
    onRows: (e: { start: number; end: number }) => setRange([e.start, Math.min(e.end, rows)]),
  });
  if (!range) return list;
  container.start = range[0];
  const shown = Array.from({ length: Math.max(0, range[1] - range[0]) }, (_, k) =>
    createElement(Fragment, { key: range[0] + k }, renderRow(range[0] + k)),
  );
  return createElement(Fragment, null, list, reconciler.createPortal(shown, container, null, `rows:${id}`));
}
