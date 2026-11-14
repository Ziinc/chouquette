// React props to baguette attributes.

/** Event props and the event type the host reports for them. */
export const events: Record<string, string> = { onClick: "click" };

export function toAttrs(props: Record<string, unknown>, handlerId: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || value == null || value === false) continue;
    if (key in events) {
      if (typeof value === "function") attrs[`phx-${events[key]}`] = handlerId;
    } else if (key === "className") attrs.class = String(value);
    else if (typeof value === "string" || typeof value === "number") attrs[key] = String(value);
    else if (value === true) attrs[key] = "";
  }
  return attrs;
}
