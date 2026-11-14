import { expect, test } from "@playwright/test";

test("dragging the card moves it", async ({ page }) => {
  const card = page.getByLabel("Card");
  await expect(page.getByText("At 40,40")).toBeVisible();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + box.height / 2 + 50, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("At 140,90")).toBeVisible();
});
