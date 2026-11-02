import { describe, expect, it } from "vitest";
import { keyFromKeyboard } from "./keyboard";

const root = document.createElement("div");
const button = document.createElement("button");
button.textContent = "7";
root.append(button);

describe("keyFromKeyboard", () => {
  it.each([
    ["0", { type: "digit", digit: "0" }],
    ["9", { type: "digit", digit: "9" }],
    [".", { type: "dot" }],
    ["+", { type: "operator", operation: "add" }],
    ["-", { type: "operator", operation: "subtract" }],
    ["*", { type: "operator", operation: "multiply" }],
    ["/", { type: "operator", operation: "divide" }],
    ["^", { type: "operator", operation: "power" }],
    ["%", { type: "percent" }],
    ["Enter", { type: "equals" }],
    ["=", { type: "equals" }],
    ["Backspace", { type: "backspace" }],
    ["Escape", { type: "ac" }],
    ["r", { type: "sqrt" }],
    ["R", { type: "sqrt" }],
    ["n", { type: "sign" }],
    ["N", { type: "sign" }],
  ])("maps %s", (key, expected) => {
    expect(keyFromKeyboard(key, root)).toEqual(expected);
  });

  it("never intercepts Tab", () => {
    expect(keyFromKeyboard("Tab", root)).toBeNull();
    expect(keyFromKeyboard("Tab", button)).toBeNull();
  });

  it("lets Enter and Space activate a focused control natively", () => {
    expect(keyFromKeyboard("Enter", button)).toBeNull();
    expect(keyFromKeyboard(" ", button)).toBeNull();
  });

  it("handles Enter on the non-interactive root", () => {
    expect(keyFromKeyboard("Enter", root)).toEqual({ type: "equals" });
  });

  it("still fires other mapped keys when a control is focused", () => {
    expect(keyFromKeyboard("7", button)).toEqual({ type: "digit", digit: "7" });
    expect(keyFromKeyboard("%", button)).toEqual({ type: "percent" });
  });

  it("ignores unmapped keys", () => {
    expect(keyFromKeyboard("a", root)).toBeNull();
    expect(keyFromKeyboard(" ", root)).toBeNull();
    expect(keyFromKeyboard("ArrowLeft", button)).toBeNull();
  });
});
