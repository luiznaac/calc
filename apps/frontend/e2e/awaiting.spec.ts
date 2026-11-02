import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, expression, start } from "./api";

test("awaiting row: swap the operator, ignore operand-less keys, then enter the right operand", async ({
  page,
}) => {
  const calls = await start(page);

  await clickKeys(page, ["key-2", "key-add"]);
  await expect(expression(page)).toHaveText("2 +");

  await clickKey(page, "key-multiply");
  await expect(expression(page)).toHaveText("2 ×");
  expect(calls).toHaveLength(0);

  await clickKeys(page, ["key-sqrt", "key-percent", "key-equals", "key-backspace"]);
  await expect(expression(page)).toHaveText("2 ×");
  await expect(display(page)).toHaveText("2");
  expect(calls).toHaveLength(0);

  await clickKey(page, "key-dot");
  await expect(display(page)).toHaveText("0.");
  await expect(expression(page)).toHaveText("2 ×");

  await clickKey(page, "key-3");
  await expect(display(page)).toHaveText("0.3");
  expect(calls).toHaveLength(0);
});
