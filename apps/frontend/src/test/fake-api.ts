import type { CalculateInput } from "../features/calculator/types";

export type FakeCall = CalculateInput;

export type FakeProblem = {
  status: number;
  code: string;
  title: string;
  detail: string;
};

export type FakeOutcome = { ok: true; result: number } | { ok: false; problem: FakeProblem };

function problem(status: number, code: string, title: string, detail: string): FakeOutcome {
  return { ok: false, problem: { status, code, title, detail } };
}

export function fakeCalculate(call: FakeCall): FakeOutcome {
  const [a = Number.NaN, b = Number.NaN] = call.operands;
  let value: number;
  switch (call.operation) {
    case "sqrt":
      if (a < 0) {
        return problem(
          422,
          "SQRT_OF_NEGATIVE",
          "Square root of a negative number",
          "Only real square roots are defined.",
        );
      }
      value = Math.sqrt(a);
      break;
    case "add":
      value = a + b;
      break;
    case "subtract":
      value = a - b;
      break;
    case "multiply":
      value = a * b;
      break;
    case "divide":
      if (b === 0) {
        return problem(
          422,
          "DIVISION_BY_ZERO",
          "Division by zero",
          "The divisor evaluated to zero.",
        );
      }
      value = a / b;
      break;
    case "power":
      if (a === 0 && b === 0) {
        return problem(
          422,
          "INDETERMINATE",
          "Indeterminate form",
          "Zero to the power of zero is undefined here.",
        );
      }
      if (a < 0 && !Number.isInteger(b)) {
        return problem(
          422,
          "COMPLEX_RESULT",
          "Complex result",
          "A negative base with a fractional exponent has no real value.",
        );
      }
      if (a === 0 && b < 0) {
        return problem(
          422,
          "DIVISION_BY_ZERO",
          "Division by zero",
          "The divisor evaluated to zero.",
        );
      }
      value = a ** b;
      break;
    default:
      return problem(
        400,
        "UNKNOWN_OPERATION",
        "Unknown operation",
        "The operation is not in the registry.",
      );
  }
  if (!Number.isFinite(value)) {
    return problem(422, "OVERFLOW", "Overflow", "The result is outside the representable range.");
  }
  return { ok: true, result: value };
}
