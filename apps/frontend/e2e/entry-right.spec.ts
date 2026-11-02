import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, expression, start } from "./api";

test("entry-right row: an operator evaluates the pending operation, then equals evaluates the new one", async ({
  page,
}) => {
  const calls = await start(page);

  await clickKeys(page, ["key-2", "key-add", "key-3"]);
  await expect(display(page)).toHaveText("3");

  await clickKey(page, "key-multiply");
  await expect(display(page)).toHaveText("5");
  await expect(expression(page)).toHaveText("5 ×");
  expect(calls).toEqual([{ operation: "add", operands: [2, 3] }]);

  await clickKey(page, "key-4");
  await expect(display(page)).toHaveText("4");

  await clickKey(page, "key-equals");
  await expect(display(page)).toHaveText("20");
  await expect(expression(page)).toHaveText("5 × 4 =");
  expect(calls).toEqual([
    { operation: "add", operands: [2, 3] },
    { operation: "multiply", operands: [5, 4] },
  ]);
});
