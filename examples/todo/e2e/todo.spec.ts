import { expect, test } from "@playwright/test";

test("adds, checks and deletes a todo", async ({ page }) => {
  await page.getByRole("textbox", { name: "Title" }).fill("Buy milk");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("1 of 1 left")).toBeVisible();
  await page.getByRole("checkbox", { name: "Buy milk" }).check();
  await expect(page.getByText("0 of 1 left")).toBeVisible();
  await page.getByRole("button", { name: "Delete Buy milk" }).click();
  await expect(page.getByText("0 of 0 left")).toBeVisible();
});
