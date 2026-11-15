import { expect, test } from "@playwright/test";

test("the starter's home page renders natively", async ({ page }) => {
  await expect(page.getByText("To get started, edit the page.tsx file.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Deploy Now" })).toBeVisible();
});
