import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, start } from "./api";

test("entry row: buffer edits, local percent, sqrt through the API", async ({ page }) => {
  const calls = await start(page);

  await clickKeys(page, ["key-1", "key-2", "key-dot", "key-5"]);
  await expect(display(page)).toHaveText("12.5");

  await clickKey(page, "key-sign");
  await expect(display(page)).toHaveText("-12.5");

  await clickKey(page, "key-backspace");
  await expect(display(page)).toHaveText("-12.");

  await clickKey(page, "key-percent");
  await expect(display(page)).toHaveText("-0.12");
  expect(calls).toHaveLength(0);

  await clickKey(page, "key-sqrt");
  await expect(display(page)).toHaveText("SQRT_OF_NEGATIVE");
  await expect(page.getByTestId("error-panel")).toBeVisible();
  expect(calls).toEqual([{ operation: "sqrt", operands: [-0.12] }]);

  await clickKey(page, "key-ac");
  await expect(display(page)).toHaveText("0");
  await expect(page.getByTestId("error-panel")).toBeHidden();
  expect(calls).toHaveLength(1);
});
