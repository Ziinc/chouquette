import { expect, test } from "vitest";
import { visualArgs } from "../cli/playwright.mjs";

test("expectations become a gpui-visual-test check", () => {
  expect(visualArgs("/v/counter.png", ["The count reads 1", { should: "The button is blue" }, { text: "No text is clipped", region: "top" }], { top: [0, 0, 360, 80] })).toEqual([
    "visual-test", "check", "/v/counter.png",
    "--region", "top=0,0,360,80",
    "-e", "The count reads 1",
    "--should", "The button is blue",
    "--expect-in", "top=No text is clipped",
  ]);
});
