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

// `style` as levain's Tailwind-style classes: lengths in pixels (or `%`
// for width and height), hex colours, and flex layout.
const lengths: Record<string, string> = {
  width: "w", height: "h", minWidth: "min-w", maxWidth: "max-w", minHeight: "min-h", maxHeight: "max-h",
  padding: "p", paddingTop: "pt", paddingBottom: "pb", paddingLeft: "pl", paddingRight: "pr",
  margin: "m", marginTop: "mt", marginBottom: "mb", gap: "gap", top: "top", left: "left", right: "right", bottom: "bottom",
};
const colors: Record<string, string> = { color: "text", backgroundColor: "bg", borderColor: "border" };
const keywords: Record<string, Record<string, string>> = {
  display: { flex: "flex", none: "hidden" },
  flexDirection: { row: "flex-row", column: "flex-col" },
  alignItems: { center: "items-center", "flex-start": "items-start", start: "items-start", "flex-end": "items-end", end: "items-end" },
  justifyContent: {
    center: "justify-center", "space-between": "justify-between", "flex-start": "justify-start", start: "justify-start",
    "flex-end": "justify-end", end: "justify-end",
  },
  position: { absolute: "absolute", relative: "relative" },
  fontWeight: { normal: "font-normal", "400": "font-normal", "500": "font-medium", "600": "font-semibold", bold: "font-bold", "700": "font-bold" },
};
const warned = new Set<string>();

export function styleClasses(style: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value == null || value === "") continue;
    const v = String(value);
    let cls: string | undefined;
    if (key in lengths) {
      const len = typeof value === "number" ? `${value}px` : /^-?[\d.]+px$/.test(v) || (/^[\d.]+%$/.test(v) && /^[wh]$/.test(lengths[key])) ? v : undefined;
      if (len) cls = `${lengths[key]}-[${len}]`;
    } else if (key in colors && /^#[0-9a-f]{3,8}$/i.test(v)) cls = `${colors[key]}-[${v}]`;
    else if (key === "opacity" && !Number.isNaN(Number(v))) cls = `opacity-${Math.round(Number(v) * 100)}`;
    else cls = keywords[key]?.[v];
    if (cls) out.push(cls);
    else if (!warned.has(`${key}:${v}`)) {
      warned.add(`${key}:${v}`);
      console.warn(`chouquette: style ${key}: ${v} has no levain class; use className`);
    }
  }
  return out;
}

const skipped = new Set(["children", "dangerouslySetInnerHTML", "suppressHydrationWarning", "ref", "key"]);

export const isCheckbox = (type: string, props: Record<string, unknown>) => type === "input" && props.type === "checkbox";

export function toAttrs(type: string, props: Record<string, unknown>, handlerId: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (skipped.has(key) || value == null || value === false) continue;
    if (key === "style" && typeof value === "object") {
      const classes = styleClasses(value as Record<string, unknown>);
      if (classes.length) attrs.class = [attrs.class, ...classes].filter(Boolean).join(" ");
      continue;
    }
    if (key in handlers) {
      // A checkbox reports its toggles as clicks.
      if (typeof value === "function") attrs[key === "onChange" && isCheckbox(type, props) ? "phx-click" : handlers[key]] = handlerId;
    } else if (key === "className" && attrs.class) attrs.class = `${value} ${attrs.class}`;
    else if (typeof value === "string" || typeof value === "number") attrs[renames[key] ?? key] = String(value);
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
