import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, expression, start } from "./api";

test("result row: no repeat on equals, continue from the result, a digit starts over", async ({
  page,
}) => {
  const calls = await start(page);

  await clickKeys(page, ["key-2", "key-add", "key-3", "key-equals"]);
  await expect(display(page)).toHaveText("5");
  expect(calls).toHaveLength(1);

  await clickKey(page, "key-equals");
  await expect(display(page)).toHaveText("5");
  await expect(expression(page)).toHaveText("2 + 3 =");
  expect(calls).toHaveLength(1);

  await clickKeys(page, ["key-add", "key-4", "key-equals"]);
  await expect(display(page)).toHaveText("9");
  expect(calls).toEqual([
    { operation: "add", operands: [2, 3] },
    { operation: "add", operands: [5, 4] },
  ]);

  await clickKey(page, "key-7");
  await expect(display(page)).toHaveText("7");
  await expect(expression(page)).toHaveText("");
  expect(calls).toHaveLength(2);

  await clickKey(page, "key-percent");
  await expect(display(page)).toHaveText("0.07");
  expect(calls).toHaveLength(2);

  await clickKey(page, "key-percent");
  await expect(display(page)).toHaveText("0.07");
  expect(calls).toHaveLength(2);

  await clickKey(page, "key-sign");
  await expect(display(page)).toHaveText("-0.07");

  await clickKey(page, "key-sqrt");
  await expect(display(page)).toHaveText("SQRT_OF_NEGATIVE");
  expect(calls).toHaveLength(3);
  expect(calls[2]).toEqual({ operation: "sqrt", operands: [-0.07] });

  await clickKey(page, "key-backspace");
  await expect(display(page)).toHaveText("SQRT_OF_NEGATIVE");
  expect(calls).toHaveLength(3);
});
