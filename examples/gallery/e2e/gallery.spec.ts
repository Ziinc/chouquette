import { expect, test } from "@playwright/test";

test("kit progress and the jobs list", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByText("50% uploaded")).toBeVisible();
  await expect(page.getByText("Job 0", { exact: true })).toBeVisible();
});

test("copy, paste and rename through the platform", async ({ page }) => {
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("button", { name: "Paste" }).click();
  await expect(page.getByText("Pasted: copied from gallery")).toBeVisible();
  await page.getByRole("button", { name: "Rename" }).click();
  // The window's own title: window.info can still report the old one just
  // after window.set_title on a slow runner (the headless test checks the text).
  await expect(page).toHaveTitle("Gallery renamed");
});
