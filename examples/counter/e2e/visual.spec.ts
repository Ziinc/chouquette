import { test } from "@playwright/test";
import { expectToLook } from "chouquette/playwright";

// gpui-playwright takes screenshots on Linux only, so far.
test("the counter looks as it should @screenshot", async ({ page }) => {
  await page.getByRole("button", { name: "Increment" }).click();
  await expectToLook(page, "counter", [
    "Large bold text reads 'Count: ' followed by a number of 1 or more",
    "Below the text is a blue button with a white plus sign",
    "The text and the button are centred horizontally",
    { should: "Nothing is cut off or overlapping" },
  ]);
});
