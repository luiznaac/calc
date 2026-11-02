import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, expression, start } from "./api";

test("error row: presentation, digit recovery, and Escape reset without extra requests", async ({
  page,
}) => {
  const calls = await start(page);

  await clickKeys(page, ["key-1", "key-divide", "key-0", "key-equals"]);
  await expect(display(page)).toHaveText("DIVISION_BY_ZERO");
  await expect(expression(page)).toHaveText("1 ÷ 0 =");
  await expect(page.getByTestId("error-panel")).toBeVisible();
  await expect(page.getByTestId("error-panel")).toContainText("Division by zero");
  expect(calls).toEqual([{ operation: "divide", operands: [1, 0] }]);

  await clickKey(page, "key-5");
  await expect(display(page)).toHaveText("5");
  await expect(page.getByTestId("error-panel")).toBeHidden();
  expect(calls).toHaveLength(1);

  await clickKeys(page, ["key-1", "key-divide", "key-0", "key-equals"]);
  await expect(display(page)).toHaveText("DIVISION_BY_ZERO");
  expect(calls[0]).toEqual({ operation: "divide", operands: [1, 0] });
  expect(calls[1]).toEqual({ operation: "divide", operands: [51, 0] });

  await page.keyboard.press("Escape");
  await expect(display(page)).toHaveText("0");
  await expect(expression(page)).toHaveText("");
  await expect(page.getByTestId("error-panel")).toBeHidden();
  expect(calls).toHaveLength(2);
});
