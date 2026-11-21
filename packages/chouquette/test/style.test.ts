import { expect, test, vi } from "vitest";
import { styleClasses, toAttrs } from "../src/props";

test("a style subset becomes levain's classes", () => {
  expect(
    styleClasses({
      width: 120, height: "50%", minWidth: "10px", padding: 8, marginTop: 4, gap: 12, top: 0,
      color: "#ff0000", backgroundColor: "#00ff00", borderColor: "#0000ff", opacity: 0.5,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
      position: "absolute", fontWeight: "bold",
    }),
  ).toEqual([
    "w-[120px]", "h-[50%]", "min-w-[10px]", "p-[8px]", "mt-[4px]", "gap-[12px]", "top-[0px]",
    "text-[#ff0000]", "bg-[#00ff00]", "border-[#0000ff]", "opacity-50",
    "flex", "flex-col", "items-center", "justify-between", "absolute", "font-bold",
  ]);
});

test("style joins className; what levain can't draw is skipped with a warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(toAttrs("div", { className: "p-2", style: { width: 10, transform: "rotate(3deg)" } }, "h1")).toEqual({ class: "p-2 w-[10px]" });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("transform"));
  warn.mockRestore();
});
