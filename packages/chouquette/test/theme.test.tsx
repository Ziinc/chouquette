import { expect, test } from "vitest";
import { useAppearance } from "../src/hooks";
import { createRoot } from "../src/root";
import type { HostEvent } from "../src/wire";

function mount(ui: React.ReactNode, theme?: Parameters<typeof createRoot>[0]["theme"]) {
  const frames: Record<string, any>[] = [];
  let emit: (e: HostEvent) => void = () => {};
  createRoot({ window: 0, theme }, { send: (_w, json) => frames.push(JSON.parse(json)), onEvent: l => (emit = l), call() {} }).render(ui);
  return { frames, emit };
}

const theme = { background: { light: "#ffffff", dark: "#000000" }, primary: "#2563eb", "primary-foreground": "#fff" };

test("frames carry the theme's tokens for the appearance", () => {
  const { frames, emit } = mount(<p>hi</p>, theme);
  expect(frames[0].theme).toEqual({ background: "#ffffff", primary: "#2563eb", "primary-foreground": "#fff" });

  emit({ type: "appearance", window: 0, appearance: "dark" } as HostEvent);
  expect(frames.at(-1)).toEqual({ root: { t: "p", a: {}, c: ["hi"] }, theme: { background: "#000000", primary: "#2563eb", "primary-foreground": "#fff" } });
});

test("without a theme a frame has none", () => {
  expect(mount(<p>hi</p>).frames[0]).toEqual({ root: { t: "p", a: {}, c: ["hi"] } });
});

test("useAppearance follows the window's appearance", () => {
  function Shows() {
    return <p>{useAppearance()}</p>;
  }
  const { frames, emit } = mount(<Shows />);
  expect(frames[0].root.c).toEqual(["light"]);
  emit({ type: "appearance", window: 0, appearance: "dark" } as HostEvent);
  expect(frames.at(-1)).toEqual({ patch: [{ op: "replace", at: [0], node: "dark" }] });
});
