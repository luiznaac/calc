import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, expression, start } from "./api";

test("computed-right row: sqrt consumes the operand, a digit replaces it, percent-of chains", async ({
  page,
}) => {
  const calls = await start(page);

  await clickKeys(page, ["key-2", "key-0", "key-0", "key-add", "key-8", "key-1", "key-sqrt"]);
  await expect(display(page)).toHaveText("9");
  await expect(expression(page)).toHaveText("200 + √(81)");
  expect(calls).toEqual([{ operation: "sqrt", operands: [81] }]);

  await clickKey(page, "key-9");
  await expect(display(page)).toHaveText("9");
  await expect(expression(page)).toHaveText("200 +");

  await clickKey(page, "key-percent");
  await expect(display(page)).toHaveText("18");
  await expect(expression(page)).toHaveText("200 + 18");

  await clickKey(page, "key-percent");
  await expect(display(page)).toHaveText("18");
  expect(calls).toHaveLength(1);

  await clickKey(page, "key-equals");
  await expect(display(page)).toHaveText("218");
  await expect(expression(page)).toHaveText("200 + 18 =");
  expect(calls).toEqual([
    { operation: "sqrt", operands: [81] },
    { operation: "add", operands: [200, 18] },
  ]);
});
