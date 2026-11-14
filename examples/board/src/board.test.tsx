import { render, screen, user } from "chouquette/test";
import { expect, test } from "vitest";
import { Board } from "./board";

test("dragging the card moves it", async () => {
  render(<Board />);
  expect(screen.getByText("At 40,40")).toBeVisible();
  await user.drag(screen.getByLabelText("Card"), 100, 50);
  expect(screen.getByText("At 140,90")).toBeVisible();
});

test("dragging the lid lifts it, and leaves the card", async () => {
  render(<Board />);
  await user.drag(screen.getByLabelText("Lid"), 5, 5);
  expect(screen.getByText("Lifts: 1")).toBeVisible();
  expect(screen.getByText("At 40,40")).toBeVisible();
});

test("a chosen file is shown", async () => {
  render(<Board />);
  await user.pickFile(screen.getByRole("button", { name: "Choose file" }), "/data/sales.csv");
  expect(screen.getByText("Chose /data/sales.csv")).toBeVisible();
});
