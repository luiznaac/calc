import { expect, test } from "@playwright/test";
import { clickKeys, display, start } from "./api";

test("in-flight row: every key is ignored while busy, Tab still moves focus, then the result lands", async ({
  page,
}) => {
  const calls = await start(page, 1200);

  await clickKeys(page, ["key-1", "key-add", "key-2", "key-equals"]);

  const root = page.getByTestId("calculator-root");
  await expect(root).toHaveAttribute("aria-busy", "true");
  await expect(display(page)).toHaveText("2");

  await clickKeys(page, ["key-7", "key-add", "key-equals", "key-ac"]);
  await expect(display(page)).toHaveText("2");
  expect(calls).toHaveLength(1);

  const focusedBefore = await page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
  await page.keyboard.press("Tab");
  const focusedAfter = await page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
  expect(focusedAfter).not.toBe(focusedBefore);
  expect(focusedAfter).not.toBeNull();
  await expect(display(page)).toHaveText("2");

  await expect(display(page)).toHaveText("3", { timeout: 5000 });
  await expect(root).toHaveAttribute("aria-busy", "false");
  expect(calls).toEqual([{ operation: "add", operands: [1, 2] }]);
});
