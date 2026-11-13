import { render, screen, user } from "chouquette/test";
import { expect, test } from "vitest";
import { Counter } from "./counter";

test("increments", async () => {
  render(<Counter />);
  await user.click(screen.getByRole("button", { name: "Increment" }));
  expect(screen.getByText("Count: 1")).toBeVisible();
});
