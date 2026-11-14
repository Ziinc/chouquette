// Conformance with levain's events.json: each input event the host sends
// reaches the React handler it belongs to, with its values.
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { createRoot } from "../src/root";
import type { HostEvent, Node } from "../src/wire";
import fixtures from "./fixtures/events.json";

type Fixture = { name: string; json: HostEvent & Record<string, unknown> };

function mount(ui: ReactNode, window: number) {
  const frames: { root?: Node }[] = [];
  let emit: (e: HostEvent) => void = () => {};
  createRoot({ window }, { send: (_w, json) => frames.push(JSON.parse(json)), onEvent: l => (emit = l), call() {} }).render(ui);
  return { root: frames[0].root as Exclude<Node, string | null>, emit };
}

// The element for each input event type, and the handler that must see it.
const elements: Record<string, (fn: (e: any) => void) => ReactNode> = {
  click: fn => <button onClick={fn}>go</button>,
  checkbox: fn => <input type="checkbox" onChange={fn} />,
  change: fn => <input name="name" onChange={fn} />,
  submit: fn => <form onSubmit={fn} />,
  keydown: fn => <div onWindowKeyDown={fn} />,
  pick: fn => <button onPickFile={fn}>open</button>,
  drag: fn => <div onDragBy={fn} />,
};

const inputs = (fixtures as Fixture[]).filter(f => ["click", "change", "submit", "keydown", "pick", "drag"].includes(f.json.type));

test("every input event type is covered", () => {
  expect(new Set(inputs.map(f => f.json.type))).toEqual(new Set(["click", "change", "submit", "keydown", "pick", "drag"]));
});

for (const { name, json } of inputs) {
  test(name, () => {
    const kind = json.type === "click" && "checked" in (json.values ?? {}) ? "checkbox" : json.type;
    const fn = vi.fn();
    const { root, emit } = mount(elements[kind](fn), json.window!);
    const id = Object.entries(root.a).find(([k]) => k.startsWith("phx-") && k !== "phx-key")![1];

    emit({ ...json, event: id });

    expect(fn).toHaveBeenCalledOnce();
    const e = fn.mock.calls[0][0];
    expect(e.type).toBe(json.type === "click" && kind === "checkbox" ? "change" : json.type);
    expect(e.values).toEqual(json.values);
    if (kind === "checkbox") expect(e.target.checked).toBe(json.values!.checked);
    if (json.type === "change") {
      const target = json.values!._target as string;
      expect(e.target).toMatchObject({ name: target, value: json.values![target] ?? "" });
    }
    if (json.type === "submit") expect(Object.fromEntries(e.formData.entries())).toEqual(json.values);
    if (json.type === "drag") expect([e.dx, e.dy]).toEqual([json.dx, json.dy]);
    if (json.type === "pick") expect(e.path).toBe(json.values!.path);
    if (json.type === "keydown") {
      const v = json.values as Record<string, unknown>;
      expect([e.key, e.ctrlKey, e.shiftKey, e.altKey, e.metaKey]).toEqual([v.key, v.ctrl, v.shift, v.alt, v.meta]);
    }
  });
}

test("a form action gets the submitted values as FormData", () => {
  const fn = vi.fn();
  const { root, emit } = mount(<form action={fn} />, 0);
  emit({ type: "submit", window: 0, event: root.a["phx-submit"], values: { name: "Ana", agree: "on" } });
  expect(Object.fromEntries(fn.mock.calls[0][0].entries())).toEqual({ name: "Ana", agree: "on" });
});

test("an event for another window is ignored", () => {
  const fn = vi.fn();
  const { root, emit } = mount(<button onClick={fn}>go</button>, 0);
  emit({ type: "click", window: 1, event: root.a["phx-click"], values: {} });
  expect(fn).not.toHaveBeenCalled();
});
