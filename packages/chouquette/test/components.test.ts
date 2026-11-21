import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { componentTypes, hashes } from "../cli/components.mjs";
import { createRoot } from "../src/root";
import fixture from "./fixtures/components.json";

test("JSX types from a manifest: enums, booleans, required attrs, events", () => {
  const dts = componentTypes([fixture]);
  expect(dts).toContain(`"kit-badge": KitProps & {`);
  expect(dts).toContain(`variant?: "primary" | "danger";`);
  expect(dts).toContain(`pill?: boolean;`);
  expect(dts).toContain(`children?: React.ReactNode;`);
  expect(dts).toMatch(/"kit-progress-bar": KitProps & \{[^}]*\bvalue: number;[^}]*onClick\?: \(e: HostSyntheticEvent\) => void;/s);
  expect(dts).toContain("/** How far along something is. */");
});

test("the gpui-kit types shipped are generated from the shipped manifest", () => {
  const dir = join(import.meta.dirname, "..");
  const manifest = JSON.parse(readFileSync(join(dir, "components/gpui-kit.json"), "utf8"));
  expect(readFileSync(join(dir, "src/components/gpui-kit.d.ts"), "utf8")).toBe(componentTypes([manifest]));
});

test("hashes by set name", () => {
  expect(hashes([fixture])).toEqual({ kit: "ad5978e625448927" });
});

test("a root asks the host to check the app's component sets, once per host, before rendering", () => {
  (globalThis as any).__chouquette_components = { "gpui-kit": "c76030cc63297c74" };
  try {
    const order: string[] = [];
    const checkComponents = vi.fn((json: string) => (order.push(`check ${json}`), true));
    const host = { send: () => void order.push("render"), onEvent() {}, call() {}, checkComponents };
    createRoot({ window: 0 }, host).render("hi");
    createRoot({ window: 1 }, host).render("hi");
    expect(order).toEqual([`check {"gpui-kit":"c76030cc63297c74"}`, "render", "render"]);
  } finally {
    delete (globalThis as any).__chouquette_components;
  }
});
