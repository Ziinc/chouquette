import { expect, test } from "@playwright/test";

test("increments", async ({ page }) => {
  await page.getByRole("button", { name: "Increment" }).click();
  await expect(page.getByText("Count: 1")).toBeVisible();
});
