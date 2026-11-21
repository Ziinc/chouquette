import { render, screen, user, within } from "chouquette/test";
import { expect, test } from "vitest";
import { Todo } from "./todo";

const title = () => screen.getByRole("textbox", { name: "Title" });

async function add(text: string) {
  await user.fill(title(), text);
  await user.submit(title());
}

test("add, check and delete todos", async () => {
  render(<Todo />);
  await add("Buy milk");
  expect(title()).toHaveValue("");

  await user.fill(title(), "Walk dog");
  await user.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByText("2 of 2 left")).toBeVisible();

  await user.click(screen.getByRole("checkbox", { name: "Buy milk" }));
  expect(screen.getByText("1 of 2 left")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Delete Walk dog" }));
  expect(screen.getByText("0 of 1 left")).toBeVisible();
});

test("the note echoes what is typed", async () => {
  render(<Todo />);
  await user.fill(screen.getByRole("textbox", { name: "Note" }), "noted");
  expect(screen.getByText("Note: noted")).toBeVisible();
});

test("Ctrl+D clears the done todos, even from the title input; typing fires nothing", async () => {
  render(<Todo />);
  await add("Done one");
  await add("Open one");
  await user.click(screen.getByRole("checkbox", { name: "Done one" }));

  await user.keydown("d", { focus: title() });
  expect(screen.text()).toContain("Done one");

  await user.keydown("d", { ctrl: true, focus: title() });
  expect(screen.text()).not.toContain("Done one");
  expect(screen.text()).toContain("Open one");
  expect(screen.getByText("Last key: ctrl+d")).toBeVisible();
});

test("buttons carry icons", async () => {
  render(<Todo />);
  await add("Iconic");
  expect(within(screen.getByRole("button", { name: "Add" })).icons()).toEqual(["plus"]);
  expect(within(screen.getByRole("button", { name: "Delete Iconic" })).icons()).toEqual(["trash"]);
});

