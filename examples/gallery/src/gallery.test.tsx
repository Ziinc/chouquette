import { render, screen, tree, user } from "chouquette/test";
import { expect, test } from "vitest";
import { Gallery } from "./gallery";

const tags = (node: any): string[] => (node && typeof node === "object" ? [node.t, ...node.c.flatMap(tags)] : []);

test("kit components render as their native tags", async () => {
  render(<Gallery />);
  expect(tags(tree())).toEqual(expect.arrayContaining(["kit-tag", "kit-progress", "kit-kbd", "kit-spinner", "kit-skeleton", "canvas", "rect"]));
  await user.click(screen.getByRole("button", { name: "More" }));
  expect(screen.getByText("50% uploaded")).toBeVisible();
});

test("the jobs list renders the rows shown", async () => {
  render(<Gallery />);
  await user.showRows("jobs", 9998, 9999);
  expect(screen.text()).toContain("Job 9998 Job 9999");
});

test("ctrl-k opens the palette from the jobs panel", async () => {
  render(<Gallery />);
  await user.keystroke("ctrl-k");
  expect(screen.getByText("Palette closed")).toBeVisible();
  await user.keystroke("ctrl-k", { focus: screen.getByRole("button", { name: "Jobs panel" }) });
  expect(screen.getByText("Palette open")).toBeVisible();
  await user.keystroke("escape");
  expect(screen.getByText("Palette closed")).toBeVisible();
});

test("copy and paste go through the clipboard; windows open and take titles", async () => {
  render(<Gallery />);
  await user.click(screen.getByRole("button", { name: "Copy" }));
  await user.click(screen.getByRole("button", { name: "Paste" }));
  expect(screen.getByText("Pasted: copied from gallery")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByText("Title: Gallery renamed")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Details" }));
  expect(screen.getByText("Details open")).toBeVisible();
  expect(screen.getByText("Appearance: light")).toBeVisible();
});

test("new entries go on top", async () => {
  render(<Gallery />);
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect(screen.getAllByText(/^Entry \d$/).map(e => e.node.c[0])).toEqual(["Entry 2", "Entry 1"]);
});
