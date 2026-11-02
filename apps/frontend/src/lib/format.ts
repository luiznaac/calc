const SIGNIFICANT_DIGITS = 12;

const displayFormatter = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  maximumSignificantDigits: SIGNIFICANT_DIGITS,
  roundingMode: "halfEven",
});

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "OVERFLOW";
  }
  if (value === 0) {
    return "0";
  }
  const formatted = displayFormatter.format(value);
  return formatted === "-0" ? "0" : formatted;
}

export function percentOf(left: number, rate: number): number {
  return left * (rate / 100);
}
