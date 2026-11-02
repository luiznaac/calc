import { expect, test } from "@playwright/test";

test("the built image serves the SPA and evaluates through nginx", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("calculator-root")).toBeVisible();
  await expect(page.getByTestId("display-main")).toHaveText("0");

  for (const testId of ["key-1", "key-add", "key-2", "key-equals"]) {
    await page.getByTestId(testId).click();
  }
  await expect(page.getByTestId("display-main")).toHaveText("3");

  await page.getByTestId("key-ac").click();
  for (const testId of [
    "key-2",
    "key-0",
    "key-0",
    "key-add",
    "key-1",
    "key-0",
    "key-percent",
    "key-equals",
  ]) {
    await page.getByTestId(testId).click();
  }
  await expect(page.getByTestId("display-main")).toHaveText("220");

  await page.getByTestId("key-ac").click();
  for (const testId of ["key-1", "key-divide", "key-0", "key-equals"]) {
    await page.getByTestId(testId).click();
  }
  await expect(page.getByTestId("display-main")).toHaveText("DIVISION_BY_ZERO");
  await expect(page.getByTestId("error-panel")).toBeVisible();

  await page.getByTestId("key-ac").click();
  await page.getByTestId("key-9").click();
  await page.getByTestId("key-sqrt").click();
  await expect(page.getByTestId("display-main")).toHaveText("3");
});
