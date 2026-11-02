import type { Locator, Page } from "@playwright/test";
import { fakeCalculate } from "../src/test/fake-api";
import type { FakeCall } from "../src/test/fake-api";

export type ApiCall = FakeCall;

export async function mockApi(page: Page, delayMs = 0): Promise<ApiCall[]> {
  const calls: ApiCall[] = [];
  await page.route("**/api/v1/calculate", async (route) => {
    const call = route.request().postDataJSON() as ApiCall;
    calls.push(call);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const outcome = fakeCalculate(call);
    if (outcome.ok) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: outcome.result }),
      });
      return;
    }
    const { status, code, title, detail } = outcome.problem;
    await route.fulfill({
      status,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: `https://calc.example/problems/${code.toLowerCase().replaceAll("_", "-")}`,
        title,
        status,
        detail,
        code,
      }),
    });
  });
  return calls;
}

export async function start(page: Page, delayMs = 0): Promise<ApiCall[]> {
  const calls = await mockApi(page, delayMs);
  await page.goto("/");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return calls;
}

export async function clickKey(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).click();
}

export async function clickKeys(page: Page, testIds: string[]): Promise<void> {
  for (const testId of testIds) {
    await clickKey(page, testId);
  }
}

export function display(page: Page): Locator {
  return page.getByTestId("display-main");
}

export function expression(page: Page): Locator {
  return page.getByTestId("expression-line");
}
