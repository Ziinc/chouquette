// React props to levain attributes.

/** Props that are handlers, and the attribute naming their event. */
const handlers: Record<string, string> = {
  onClick: "phx-click",
  onChange: "phx-change",
  onSubmit: "phx-submit",
  // React 19's form actions: `<form action={formData => ...}>`.
  action: "phx-submit",
  onWindowKeyDown: "phx-window-keydown",
  onPickFile: "phx-pick-file",
  onPickSave: "phx-pick-save",
  onDragBy: "phx-drag",
  onRows: "phx-rows",
};

/** Props whose attribute is named otherwise. */
const renames: Record<string, string> = {
  className: "class",
  tabIndex: "tabindex",
  keyContext: "key-context",
  windowKey: "phx-key",
  htmlFor: "for",
  strokeWidth: "stroke-width",
  defaultValue: "value",
  defaultChecked: "checked",
  rowHeight: "row-height",
  defaultName: "default-name",
};

const skipped = new Set(["children", "dangerouslySetInnerHTML", "suppressHydrationWarning", "ref", "key"]);

export const isCheckbox = (type: string, props: Record<string, unknown>) => type === "input" && props.type === "checkbox";

export function toAttrs(type: string, props: Record<string, unknown>, handlerId: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (skipped.has(key) || value == null || value === false) continue;
    if (key in handlers) {
      // A checkbox reports its toggles as clicks.
      if (typeof value === "function") attrs[key === "onChange" && isCheckbox(type, props) ? "phx-click" : handlers[key]] = handlerId;
    } else if (typeof value === "string" || typeof value === "number") attrs[renames[key] ?? key] = String(value);
    else if (value === true) attrs[renames[key] ?? key] = "";
  }
  return attrs;
}

/** The handler props an event of the host's `type` runs, with the type their event gets. */
export function handlersFor(type: string, eventType: string, props: Record<string, unknown>): [string, string][] {
  switch (eventType) {
    case "click":
      return isCheckbox(type, props) ? [["onClick", "click"], ["onChange", "change"]] : [["onClick", "click"]];
    case "change":
      return [["onChange", "change"]];
    case "submit":
      return [["onSubmit", "submit"], ["action", "action"]];
    case "keydown":
      return [["onWindowKeyDown", "keydown"]];
    case "pick":
      return [["onPickFile", "pick"], ["onPickSave", "pick"]];
    case "drag":
      return [["onDragBy", "drag"]];
    case "rows":
      return [["onRows", "rows"]];
    default:
      return [];
  }
}
