import { describe, expect, it } from "vitest";
import { formatNumber, percentOf } from "./format";

describe("formatNumber", () => {
  it("formats integers without a decimal point", () => {
    expect(formatNumber(3)).toBe("3");
    expect(formatNumber(42)).toBe("42");
  });

  it("hides floating-point noise behind 12 significant digits", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(1 / 3)).toBe("0.333333333333");
  });

  it("trims trailing zeros", () => {
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(2)).toBe("2");
  });

  it("normalizes negative zero", () => {
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(0)).toBe("0");
  });

  it("caps the display at 12 significant digits", () => {
    expect(formatNumber(1234567890123)).toBe("1234567890120");
  });

  it("rounds exact ties half to even", () => {
    expect(formatNumber(1234567890125)).toBe("1234567890120");
    expect(formatNumber(1234567890135)).toBe("1234567890140");
  });

  it("keeps a negative sign", () => {
    expect(formatNumber(-1234.5)).toBe("-1234.5");
  });

  it("marks a non-finite value as overflow", () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("OVERFLOW");
    expect(formatNumber(Number.NaN)).toBe("OVERFLOW");
  });
});

describe("percentOf", () => {
  it("computes a percentage of the left operand with one rounding", () => {
    expect(percentOf(200, 10)).toBe(20);
    expect(percentOf(200, 12.5)).toBe(25);
  });

  it("avoids a spurious intermediate overflow", () => {
    const value = percentOf(1e308, 10);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value / 1e307).toBeCloseTo(1, 12);
  });

  it("returns a non-finite value for a genuinely overflowing percentage", () => {
    expect(percentOf(1e308, 1000)).toBe(Number.POSITIVE_INFINITY);
  });
});
