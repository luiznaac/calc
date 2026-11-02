import { describe, expect, it } from "vitest";
import { appendDigit, appendDot, backspace, toggleSign } from "./entry";

describe("appendDigit", () => {
  it("starts an entry with the pressed digit", () => {
    expect(appendDigit(null, "5")).toBe("5");
    expect(appendDigit(null, "0")).toBe("0");
  });

  it("replaces a lone leading zero", () => {
    expect(appendDigit("0", "5")).toBe("5");
    expect(appendDigit("0", "0")).toBe("0");
  });

  it("appends to a non-zero entry", () => {
    expect(appendDigit("12", "3")).toBe("123");
  });

  it("keeps a decimal entry intact", () => {
    expect(appendDigit("1.2", "3")).toBe("1.23");
    expect(appendDigit("0.", "5")).toBe("0.5");
  });

  it("replaces a negative zero without producing a leading zero", () => {
    expect(appendDigit("-0", "5")).toBe("-5");
    expect(appendDigit("-0", "0")).toBe("-0");
  });

  it("caps the entry at 12 significant digits", () => {
    const twelve = "123456789012";
    expect(appendDigit(twelve, "3")).toBe(twelve);
  });

  it("does not count leading zeros as significant", () => {
    expect(appendDigit("0.000000000001", "2")).toBe("0.0000000000012");
  });
});

describe("appendDot", () => {
  it("turns a leading dot into zero-dot", () => {
    expect(appendDot(null)).toBe("0.");
  });

  it("appends one dot only", () => {
    expect(appendDot("5")).toBe("5.");
    expect(appendDot("5.")).toBe("5.");
    expect(appendDot("1.2")).toBe("1.2");
  });
});

describe("toggleSign", () => {
  it("leaves zero unchanged", () => {
    expect(toggleSign("0")).toBe("0");
    expect(toggleSign("0.")).toBe("0.");
  });

  it("toggles the sign of an entry", () => {
    expect(toggleSign("5")).toBe("-5");
    expect(toggleSign("-5")).toBe("5");
    expect(toggleSign("12.5")).toBe("-12.5");
  });
});

describe("backspace", () => {
  it("deletes the last character", () => {
    expect(backspace("123")).toBe("12");
  });

  it("falls back to zero when the entry becomes empty", () => {
    expect(backspace("1")).toBe("0");
    expect(backspace("")).toBe("0");
    expect(backspace("-")).toBe("0");
  });
});
