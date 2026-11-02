import { expect, test } from "@playwright/test";
import { clickKey, clickKeys, display, expression, start } from "./api";

test("initial row: digits start an entry, operators await, the rest are no-ops", async ({
  page,
}) => {
  const calls = await start(page);

  await clickKey(page, "key-5");
  await expect(display(page)).toHaveText("5");

  await clickKey(page, "key-ac");
  await expect(display(page)).toHaveText("0");

  await clickKey(page, "key-dot");
  await expect(display(page)).toHaveText("0.");

  await clickKey(page, "key-ac");
  await clickKey(page, "key-add");
  await expect(expression(page)).toHaveText("0 +");
  await expect(display(page)).toHaveText("0");

  await clickKey(page, "key-ac");
  await clickKeys(page, ["key-equals", "key-percent", "key-sqrt", "key-sign", "key-backspace"]);
  await expect(display(page)).toHaveText("0");
  await expect(expression(page)).toHaveText("");

  expect(calls).toHaveLength(0);
});
