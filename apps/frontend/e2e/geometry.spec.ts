import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type Box = {
  width: number;
  height: number;
  centerX: number;
  right: number;
  top: number;
  bottom: number;
};

const VIEWPORTS = [
  { name: "1280x900", width: 1280, height: 900 },
  { name: "390x844", width: 390, height: 844 },
  { name: "844x390", width: 844, height: 390 },
  { name: "667x375", width: 667, height: 375 },
  { name: "568x320", width: 568, height: 320 },
];

const SAME_COLUMN_TOLERANCE = 3;
const SAME_COLUMN_RATIO = 0.08;
const VERTICAL_TOLERANCE = 2;
const VERTICAL_RATIO = 0.06;
const FUNCTION_OVERLAP = 2;

async function box(page: Page, testId: string): Promise<Box> {
  const bounds = await page.getByTestId(testId).boundingBox();
  if (bounds === null) {
    throw new Error(`No bounding box for ${testId}`);
  }
  return {
    width: bounds.width,
    height: bounds.height,
    centerX: bounds.x + bounds.width / 2,
    right: bounds.x + bounds.width,
    top: bounds.y,
    bottom: bounds.y + bounds.height,
  };
}

function sameColumn(upper: Box, lower: Box): boolean {
  return (
    Math.abs(upper.centerX - lower.centerX) <=
    Math.max(SAME_COLUMN_TOLERANCE, lower.width * SAME_COLUMN_RATIO)
  );
}

function above(upper: Box, lower: Box): boolean {
  return (
    upper.bottom <= lower.top + Math.max(VERTICAL_TOLERANCE, lower.height * VERTICAL_RATIO) &&
    sameColumn(upper, lower)
  );
}

function functionAbove(key: Box, digit: Box): boolean {
  return key.bottom <= digit.top + FUNCTION_OVERLAP && key.top < digit.top;
}

function rightOf(operator: Box, digit: Box): boolean {
  return operator.centerX > digit.right;
}

for (const viewport of VIEWPORTS) {
  test(`keypad geometry at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const ids = [
      "key-7",
      "key-4",
      "key-1",
      "key-8",
      "key-5",
      "key-2",
      "key-9",
      "key-6",
      "key-3",
      "key-0",
      "key-dot",
      "key-equals",
      "key-ac",
      "key-sqrt",
      "key-sign",
      "key-percent",
      "key-divide",
      "key-multiply",
      "key-subtract",
      "key-add",
    ];
    const boxes: Record<string, Box> = {};
    for (const id of ids) {
      boxes[id] = await box(page, id);
    }

    const results: Array<[string, boolean]> = [];
    const check = (label: string, passed: boolean) => results.push([label, passed]);

    const digitRelations: Array<[string, string]> = [
      ["key-7", "key-4"],
      ["key-4", "key-1"],
      ["key-8", "key-5"],
      ["key-5", "key-2"],
      ["key-9", "key-6"],
      ["key-6", "key-3"],
      ["key-1", "key-0"],
      ["key-2", "key-dot"],
      ["key-3", "key-equals"],
    ];
    for (const [upper, lower] of digitRelations) {
      check(`${upper} above ${lower}`, above(boxes[upper] as Box, boxes[lower] as Box));
    }

    for (const functionKey of ["key-ac", "key-sqrt", "key-sign", "key-percent"]) {
      check(
        `${functionKey} above the digit block`,
        functionAbove(boxes[functionKey] as Box, boxes["key-7"] as Box),
      );
    }

    const operatorRelations: Array<[string, string]> = [
      ["key-divide", "key-9"],
      ["key-multiply", "key-6"],
      ["key-subtract", "key-3"],
      ["key-add", "key-equals"],
    ];
    for (const [operator, digit] of operatorRelations) {
      check(`${operator} right of ${digit}`, rightOf(boxes[operator] as Box, boxes[digit] as Box));
    }

    const operatorStack: Array<[string, string]> = [
      ["key-divide", "key-multiply"],
      ["key-multiply", "key-subtract"],
      ["key-subtract", "key-add"],
    ];
    for (const [upper, lower] of operatorStack) {
      check(`${upper} above ${lower}`, above(boxes[upper] as Box, boxes[lower] as Box));
    }

    expect(results).toHaveLength(20);
    expect(results.filter(([, passed]) => !passed).map(([label]) => label)).toEqual([]);

    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });
}
