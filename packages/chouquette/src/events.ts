// The event objects handlers receive, from the host's events.
import type { HostEvent } from "./wire";

/** A read-only FormData, from the values a form submits. */
export class FormValues {
  constructor(private readonly values: Record<string, unknown>) {}
  get(name: string) {
    return name in this.values ? String(this.values[name]) : null;
  }
  getAll(name: string) {
    return name in this.values ? [String(this.values[name])] : [];
  }
  has(name: string) {
    return name in this.values;
  }
  *entries(): IterableIterator<[string, string]> {
    for (const [k, v] of Object.entries(this.values)) yield [k, String(v)];
  }
  keys() {
    return Object.keys(this.values)[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

export type HostSyntheticEvent = {
  type: string;
  values: Record<string, unknown>;
  target: { name?: string; value?: string; checked?: boolean };
  currentTarget: HostSyntheticEvent["target"];
  preventDefault(): void;
  stopPropagation(): void;
  formData?: FormValues;
  key?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  path?: string;
  dx?: number;
  dy?: number;
};

type Raw = HostEvent & { dx?: number; dy?: number };

/** The event a handler of `type` gets for the host's `event`. */
export function syntheticEvent(type: string, event: Raw): HostSyntheticEvent {
  const values = event.values ?? {};
  const target: HostSyntheticEvent["target"] = {};
  const e: HostSyntheticEvent = { type, values, target, currentTarget: target, preventDefault() {}, stopPropagation() {} };
  if (type === "change" && event.type === "click") {
    target.checked = Boolean(values.checked);
  } else if (type === "change") {
    const name = String(values._target ?? "value");
    target.name = name;
    target.value = values[name] === undefined ? "" : String(values[name]);
  } else if (type === "submit") {
    e.formData = new FormValues(values);
  } else if (type === "keydown") {
    Object.assign(e, { key: values.key, ctrlKey: values.ctrl, shiftKey: values.shift, altKey: values.alt, metaKey: values.meta });
  } else if (type === "pick") {
    e.path = String(values.path);
  } else if (type === "drag") {
    Object.assign(e, { dx: event.dx, dy: event.dy });
  }
  return e;
}
