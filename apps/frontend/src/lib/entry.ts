const MAX_SIGNIFICANT_DIGITS = 12;

export function significantDigits(entry: string): number {
  return entry.replace(/[-.]/g, "").replace(/^0+/, "").length;
}

export function appendDigit(entry: string | null, digit: string): string {
  if (entry === null) {
    return digit;
  }
  if (entry === "0") {
    return digit;
  }
  if (entry === "-0") {
    return digit === "0" ? "-0" : `-${digit}`;
  }
  const next = entry + digit;
  return significantDigits(next) > MAX_SIGNIFICANT_DIGITS ? entry : next;
}

export function appendDot(entry: string | null): string {
  if (entry === null) {
    return "0.";
  }
  return entry.includes(".") ? entry : `${entry}.`;
}

export function toggleSign(entry: string): string {
  if (Number.parseFloat(entry) === 0) {
    return entry;
  }
  return entry.startsWith("-") ? entry.slice(1) : `-${entry}`;
}

export function backspace(entry: string | null): string {
  if (entry === null) {
    return "0";
  }
  const next = entry.slice(0, -1);
  return next === "" || next === "-" ? "0" : next;
}
