import type { CalculatorKey } from "./types";

const INTERACTIVE_SELECTOR = "button, input, textarea, select, [contenteditable='true']";

const SIMPLE_KEYS: Record<string, CalculatorKey> = {
  ".": { type: "dot" },
  "+": { type: "operator", operation: "add" },
  "-": { type: "operator", operation: "subtract" },
  "*": { type: "operator", operation: "multiply" },
  "/": { type: "operator", operation: "divide" },
  "^": { type: "operator", operation: "power" },
  "%": { type: "percent" },
  Enter: { type: "equals" },
  "=": { type: "equals" },
  Backspace: { type: "backspace" },
  Escape: { type: "ac" },
  r: { type: "sqrt" },
  R: { type: "sqrt" },
  n: { type: "sign" },
  N: { type: "sign" },
};

export function keyFromKeyboard(key: string, target: EventTarget | null): CalculatorKey | null {
  if (key === "Tab") {
    return null;
  }

  const element = target instanceof Element ? target : null;
  const interactive = element?.closest(INTERACTIVE_SELECTOR) ?? null;
  if (interactive !== null && (key === "Enter" || key === " ")) {
    return null;
  }

  if (/^[0-9]$/.test(key)) {
    return { type: "digit", digit: key };
  }
  return SIMPLE_KEYS[key] ?? null;
}
