import { describe, expect, it } from "vitest";
import { drive, press } from "../../test/calculator";
import { calculatorReducer, initialState, mainDisplay, stateName } from "./reducer";

describe("initial state", () => {
  it("starts cleared", () => {
    const state = initialState();
    expect(stateName(state)).toBe("initial");
    expect(mainDisplay(state)).toBe("0");
    expect(state.expression).toBe("");
    expect(state.request).toBeNull();
  });

  it("starts an entry from a digit", () => {
    const state = press(initialState(), "5");
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("5");
    expect(mainDisplay(state)).toBe("5");
  });

  it("starts an entry from a dot", () => {
    const state = press(initialState(), ".");
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("0.");
    expect(mainDisplay(state)).toBe("0.");
  });

  it("uses zero as the left operand for a first operator", () => {
    const state = press(initialState(), "+");
    expect(stateName(state)).toBe("awaiting");
    expect(state.left).toBe(0);
    expect(state.pending).toBe("add");
    expect(state.expression).toBe("0 +");
    expect(mainDisplay(state)).toBe("0");
  });

  it.each(["=", "%", "sqrt", "sign", "backspace"])("ignores %s", (token) => {
    const { state, requests } = drive([token]);
    expect(stateName(state)).toBe("initial");
    expect(requests).toHaveLength(0);
  });

  it("resets on AC", () => {
    const state = press(initialState(), "ac");
    expect(stateName(state)).toBe("initial");
  });
});

describe("entry state", () => {
  it("appends digits and one decimal point", () => {
    const { state } = drive(["1", "2", ".", "5"]);
    expect(state.entry).toBe("12.5");
    expect(stateName(state)).toBe("entry");
  });

  it("ignores a second decimal point", () => {
    const { state } = drive(["1", ".", ".", "2"]);
    expect(state.entry).toBe("1.2");
  });

  it("does not keep leading zeros", () => {
    expect(drive(["0", "0", "5"]).state.entry).toBe("5");
  });

  it("normalizes a backspaced negative-zero entry and keeps its sign", () => {
    const { state } = drive(["0", ".", "5", "sign", "backspace", "backspace"]);
    expect(state.entry).toBe("-0");
    expect(mainDisplay(state)).toBe("0");
    expect(press(state, "5").entry).toBe("-5");
  });

  it("caps the entry at 12 significant digits", () => {
    const { state } = drive(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2", "3"]);
    expect(state.entry).toBe("123456789012");
  });

  it("moves to awaiting when an operator is pressed", () => {
    const { state, requests } = drive(["2", "+"]);
    expect(stateName(state)).toBe("awaiting");
    expect(state.left).toBe(2);
    expect(state.pending).toBe("add");
    expect(state.expression).toBe("2 +");
    expect(requests).toHaveLength(0);
  });

  it("is a no-op on equals without a pending operation", () => {
    const { state, requests } = drive(["2", "="]);
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("2");
    expect(requests).toHaveLength(0);
  });

  it("applies percent locally with no request", () => {
    const { state, requests } = drive(["5", "0", "%"]);
    expect(stateName(state)).toBe("result");
    expect(mainDisplay(state)).toBe("0.5");
    expect(state.expression).toBe("");
    expect(requests).toHaveLength(0);
  });

  it("toggles the sign of the typed entry", () => {
    expect(drive(["1", "2", "3", "sign"]).state.entry).toBe("-123");
    expect(drive(["1", "2", "3", "sign", "sign"]).state.entry).toBe("123");
    expect(drive(["0", "sign"]).state.entry).toBe("0");
  });

  it("deletes through backspace and falls back to zero", () => {
    expect(drive(["1", "2", "3", "backspace"]).state.entry).toBe("12");
    expect(drive(["1", "backspace"]).state.entry).toBe("0");
  });

  it("evaluates sqrt through the API", () => {
    const { state, requests } = drive(["9", "sqrt"]);
    expect(requests).toEqual([{ operation: "sqrt", operands: [9] }]);
    expect(stateName(state)).toBe("result");
    expect(mainDisplay(state)).toBe("3");
    expect(state.expression).toBe("√(9)");
  });

  it("resets on AC", () => {
    const state = press(press(initialState(), "5"), "ac");
    expect(stateName(state)).toBe("initial");
    expect(mainDisplay(state)).toBe("0");
  });
});

describe("awaiting state", () => {
  it("swaps the pending operator without a request", () => {
    const { state, requests } = drive(["2", "+", "*"]);
    expect(stateName(state)).toBe("awaiting");
    expect(state.pending).toBe("multiply");
    expect(state.expression).toBe("2 ×");
    expect(requests).toHaveLength(0);
  });

  it("starts the right operand from a digit", () => {
    const { state } = drive(["2", "+", "3"]);
    expect(stateName(state)).toBe("entry-right");
    expect(state.entry).toBe("3");
  });

  it("starts the right operand from a dot", () => {
    const { state } = drive(["2", "+", "."]);
    expect(stateName(state)).toBe("entry-right");
    expect(state.entry).toBe("0.");
  });

  it.each(["=", "%", "sqrt", "sign", "backspace"])("ignores %s", (token) => {
    const { state, requests } = drive(["2", "+", token]);
    expect(stateName(state)).toBe("awaiting");
    expect(requests).toHaveLength(0);
  });

  it("resets on AC", () => {
    const { state } = drive(["2", "+", "ac"]);
    expect(stateName(state)).toBe("initial");
  });
});

describe("entry-right state", () => {
  it("evaluates the pending operation when another operator is pressed", () => {
    const { state, requests } = drive(["2", "+", "3", "*"]);
    expect(requests).toEqual([{ operation: "add", operands: [2, 3] }]);
    expect(stateName(state)).toBe("awaiting");
    expect(state.left).toBe(5);
    expect(state.pending).toBe("multiply");
    expect(state.expression).toBe("5 ×");
  });

  it("evaluates the pending operation on equals", () => {
    const { state, requests } = drive(["2", "+", "3", "="]);
    expect(requests).toEqual([{ operation: "add", operands: [2, 3] }]);
    expect(stateName(state)).toBe("result");
    expect(mainDisplay(state)).toBe("5");
    expect(state.expression).toBe("2 + 3 =");
    expect(state.tape).toEqual([{ expression: "2 + 3 =", result: "5" }]);
  });

  it("computes add/subtract percent as a percent of the left operand", () => {
    const add = drive(["2", "0", "0", "+", "1", "0", "%"]);
    expect(stateName(add.state)).toBe("computed-right");
    expect(add.state.computed).toBe(20);
    expect(add.state.expression).toBe("200 + 20");
    expect(add.requests).toHaveLength(0);

    const subtract = drive(["2", "0", "0", "-", "1", "0", "%"]);
    expect(subtract.state.computed).toBe(20);
    expect(subtract.state.expression).toBe("200 − 20");
  });

  it("computes multiply/divide percent as a unary percent", () => {
    const multiply = drive(["2", "0", "0", "*", "1", "0", "%"]);
    expect(multiply.state.computed).toBeCloseTo(0.1, 12);
    expect(multiply.state.expression).toBe("200 × 0.1");

    const divide = drive(["2", "0", "0", "/", "1", "0", "%"]);
    expect(divide.state.computed).toBeCloseTo(0.1, 12);
    expect(divide.state.expression).toBe("200 ÷ 0.1");
  });

  it("enters a local OVERFLOW on a non-finite percent", () => {
    const state = calculatorReducer(
      { ...initialState(), left: 1e308, pending: "add", entry: "1000" },
      { type: "press", key: { type: "percent" } },
    );
    expect(stateName(state)).toBe("error");
    expect(state.error?.code).toBe("OVERFLOW");
    expect(state.request).toBeNull();
  });

  it("evaluates sqrt as the computed right operand", () => {
    const { state, requests } = drive(["2", "+", "9", "sqrt"]);
    expect(requests).toEqual([{ operation: "sqrt", operands: [9] }]);
    expect(stateName(state)).toBe("computed-right");
    expect(state.pending).toBe("add");
    expect(state.computed).toBe(3);
    expect(state.expression).toBe("2 + √(9)");
  });

  it("toggles the sign of the right entry", () => {
    const { state } = drive(["2", "+", "3", "sign"]);
    expect(state.entry).toBe("-3");
  });

  it("edits the right entry with backspace", () => {
    const { state } = drive(["2", "+", "3", "4", "backspace"]);
    expect(state.entry).toBe("3");
  });

  it("resets on AC", () => {
    const { state } = drive(["2", "+", "3", "ac"]);
    expect(stateName(state)).toBe("initial");
  });
});

describe("computed-right state", () => {
  it("replaces the computed operand when a digit is pressed", () => {
    const { state } = drive(["2", "0", "0", "+", "1", "0", "%", "5"]);
    expect(stateName(state)).toBe("entry-right");
    expect(state.entry).toBe("5");
    expect(state.computed).toBeNull();
    expect(state.expression).toBe("200 +");
  });

  it("replaces the computed operand when a dot is pressed", () => {
    const { state } = drive(["2", "0", "0", "+", "1", "0", "%", "."]);
    expect(stateName(state)).toBe("entry-right");
    expect(state.entry).toBe("0.");
  });

  it("evaluates the pending operation when another operator is pressed", () => {
    const { state, requests } = drive(["2", "0", "0", "+", "1", "0", "%", "*"]);
    expect(requests).toEqual([{ operation: "add", operands: [200, 20] }]);
    expect(stateName(state)).toBe("awaiting");
    expect(state.left).toBe(220);
    expect(state.pending).toBe("multiply");
  });

  it("evaluates the pending operation on equals", () => {
    const { state, requests } = drive(["2", "0", "0", "+", "1", "0", "%", "="]);
    expect(requests).toEqual([{ operation: "add", operands: [200, 20] }]);
    expect(stateName(state)).toBe("result");
    expect(mainDisplay(state)).toBe("220");
  });

  it("ignores a repeated percent", () => {
    const { state, requests } = drive(["2", "0", "0", "+", "1", "0", "%", "%"]);
    expect(state.computed).toBe(20);
    expect(requests).toHaveLength(0);
  });

  it("evaluates sqrt on the computed operand", () => {
    const { state, requests } = drive(["2", "0", "0", "+", "1", "0", "%", "sqrt"]);
    expect(requests).toEqual([{ operation: "sqrt", operands: [20] }]);
    expect(stateName(state)).toBe("computed-right");
    expect(state.computed).toBeCloseTo(Math.sqrt(20), 12);
    expect(state.pending).toBe("add");
  });

  it("toggles the computed operand", () => {
    const { state } = drive(["2", "0", "0", "+", "1", "0", "%", "sign"]);
    expect(state.computed).toBe(-20);
    expect(state.expression).toBe("200 + -20");
  });

  it("does not edit a computed operand with backspace", () => {
    const { state } = drive(["2", "0", "0", "+", "1", "0", "%", "backspace"]);
    expect(stateName(state)).toBe("computed-right");
    expect(state.computed).toBe(20);
  });

  it("resets on AC", () => {
    const { state } = drive(["2", "0", "0", "+", "1", "0", "%", "ac"]);
    expect(stateName(state)).toBe("initial");
  });
});

describe("percent journeys", () => {
  it("sends add(200, 20) for 200 + 10% = and displays 220", () => {
    const { state, requests } = drive(["2", "0", "0", "+", "1", "0", "%", "="]);
    expect(requests).toEqual([{ operation: "add", operands: [200, 20] }]);
    expect(mainDisplay(state)).toBe("220");
  });

  it("sends multiply(200, 0.1) for 200 × 10% = and displays 20", () => {
    const { state, requests } = drive(["2", "0", "0", "*", "1", "0", "%", "="]);
    expect(requests[0]?.operation).toBe("multiply");
    expect(requests[0]?.operands[0]).toBe(200);
    expect(requests[0]?.operands[1]).toBeCloseTo(0.1, 12);
    expect(mainDisplay(state)).toBe("20");
  });

  it("applies the entry-right percent-of cell for a pending power", () => {
    const { state, requests } = drive(["2", "^", "5", "0", "%"]);
    expect(state.computed).toBe(1);
    expect(state.expression).toBe("2 ^ 1");
    expect(requests).toHaveLength(0);
  });

  it("surfaces an API error reached through a percent-derived operand", () => {
    const { state, requests } = drive(["2", "0", "0", "/", "0", "%", "="]);
    expect(requests).toEqual([{ operation: "divide", operands: [200, 0] }]);
    expect(state.error?.code).toBe("DIVISION_BY_ZERO");
  });

  it("chains 200 + 10 % × 2 = to 440", () => {
    const { state, requests } = drive(["2", "0", "0", "+", "1", "0", "%", "*", "2", "="]);
    expect(requests).toEqual([
      { operation: "add", operands: [200, 20] },
      { operation: "multiply", operands: [220, 2] },
    ]);
    expect(mainDisplay(state)).toBe("440");
  });
});

describe("result state", () => {
  it("does not repeat the operation on a second equals", () => {
    const { state, requests } = drive(["2", "+", "3", "=", "="]);
    expect(requests).toHaveLength(1);
    expect(mainDisplay(state)).toBe("5");
    expect(state.expression).toBe("2 + 3 =");
  });

  it("continues from a result with a new operator", () => {
    const { state, requests } = drive(["2", "+", "3", "=", "+", "4", "="]);
    expect(requests).toEqual([
      { operation: "add", operands: [2, 3] },
      { operation: "add", operands: [5, 4] },
    ]);
    expect(mainDisplay(state)).toBe("9");
  });

  it("starts a new calculation from a digit", () => {
    const { state, requests } = drive(["2", "+", "3", "=", "7"]);
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("7");
    expect(state.result).toBeNull();
    expect(state.expression).toBe("");
    expect(requests).toHaveLength(1);
  });

  it("starts a new calculation from a dot", () => {
    const { state } = drive(["2", "+", "3", "=", "."]);
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("0.");
  });

  it("uses the result as the left operand of a new operator", () => {
    const { state } = drive(["2", "+", "3", "=", "*"]);
    expect(stateName(state)).toBe("awaiting");
    expect(state.left).toBe(5);
    expect(state.pending).toBe("multiply");
    expect(state.expression).toBe("5 ×");
  });

  it("applies percent to a result once", () => {
    const first = drive(["2", "+", "3", "=", "%"]);
    expect(stateName(first.state)).toBe("result");
    expect(mainDisplay(first.state)).toBe("0.05");
    expect(first.requests).toHaveLength(1);

    const repeated = drive(["2", "+", "3", "=", "%", "%"]);
    expect(mainDisplay(repeated.state)).toBe("0.05");
    expect(repeated.requests).toHaveLength(1);
  });

  it("evaluates sqrt on a result", () => {
    const { state, requests } = drive(["2", "+", "3", "=", "sqrt"]);
    expect(requests).toEqual([
      { operation: "add", operands: [2, 3] },
      { operation: "sqrt", operands: [5] },
    ]);
    expect(mainDisplay(state)).toBeCloseTo(Math.sqrt(5), 6);
  });

  it("toggles the sign of a result", () => {
    const { state } = drive(["2", "+", "3", "=", "sign"]);
    expect(mainDisplay(state)).toBe("-5");
  });

  it("is a no-op on backspace", () => {
    const { state } = drive(["2", "+", "3", "=", "backspace"]);
    expect(mainDisplay(state)).toBe("5");
  });
});

describe("error state", () => {
  it("shows an API problem, keeps the attempted expression, and records the request", () => {
    const { state, requests } = drive(["1", "/", "0", "="]);
    expect(requests).toHaveLength(1);
    expect(stateName(state)).toBe("error");
    expect(state.error?.code).toBe("DIVISION_BY_ZERO");
    expect(mainDisplay(state)).toBe("DIVISION_BY_ZERO");
    expect(state.expression).toBe("1 ÷ 0 =");
  });

  it("recovers with a digit and sends no request", () => {
    const { state, requests } = drive(["1", "/", "0", "=", "5"]);
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("5");
    expect(state.error).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it("recovers with a dot", () => {
    const { state } = drive(["1", "/", "0", "=", "."]);
    expect(stateName(state)).toBe("entry");
    expect(state.entry).toBe("0.");
  });

  it.each(["*", "=", "%", "sqrt", "sign", "backspace"])("ignores %s", (token) => {
    const { state, requests } = drive(["1", "/", "0", "=", token]);
    expect(stateName(state)).toBe("error");
    expect(requests).toHaveLength(1);
  });

  it("resets on AC", () => {
    const { state } = drive(["1", "/", "0", "=", "ac"]);
    expect(stateName(state)).toBe("initial");
    expect(state.error).toBeNull();
  });

  it("drops the operator that triggered a chained error", () => {
    const { state, requests } = drive(["1", "/", "0", "+"]);
    expect(requests).toEqual([{ operation: "divide", operands: [1, 0] }]);
    expect(stateName(state)).toBe("error");
    expect(state.pending).toBe("divide");
  });

  it("shows sqrt of a negative as a problem", () => {
    const { state } = drive(["4", "sign", "sqrt"]);
    expect(state.error?.code).toBe("SQRT_OF_NEGATIVE");
    expect(state.expression).toBe("√(-4)");
  });
});

describe("request ids", () => {
  it("keeps ids monotonic across AC so a new request is dispatched", () => {
    const { state } = drive(["2", "+", "3", "="]);
    expect(state.requestCounter).toBe(1);

    const cleared = press(state, "ac");
    expect(cleared.requestCounter).toBe(1);

    let next = press(cleared, "1");
    next = press(next, "+");
    next = press(next, "2");
    next = press(next, "=");
    expect(next.request?.id).toBe(2);
  });
});

describe("in-flight lock", () => {
  it("ignores every key while a request is outstanding", () => {
    let state = drive(["1", "+", "2"], undefined, initialState()).state;
    state = press(state, "=");
    expect(state.inFlight).toBe(true);
    expect(state.request).not.toBeNull();

    const locked = state;
    for (const token of ["7", "+", "=", "ac"]) {
      state = press(state, token);
      expect(state).toBe(locked);
    }
    expect(stateName(state)).toBe("inFlight");
  });

  it("ignores a settle for a different request id", () => {
    const state = press(drive(["1", "+", "2"]).state, "=");
    const request = state.request;
    expect(request).not.toBeNull();
    const stale = calculatorReducer(state, {
      type: "settle",
      id: (request?.id ?? 0) + 1,
      outcome: { ok: true, result: 99 },
    });
    expect(stale).toBe(state);
  });

  it("settles the outstanding request", () => {
    const armed = press(drive(["1", "+", "2"]).state, "=");
    const request = armed.request;
    expect(request).not.toBeNull();
    const settled = calculatorReducer(armed, {
      type: "settle",
      id: request?.id ?? 0,
      outcome: { ok: true, result: 3 },
    });
    expect(settled.inFlight).toBe(false);
    expect(stateName(settled)).toBe("result");
    expect(mainDisplay(settled)).toBe("3");
  });
});

describe("display formatting and float chaining", () => {
  it("formats the display to 12 significant digits but chains the exact float", () => {
    const { state, requests } = drive([
      "0",
      ".",
      "1",
      "+",
      "0",
      ".",
      "2",
      "=",
      "+",
      "0",
      ".",
      "1",
      "=",
    ]);
    expect(requests[0]).toEqual({ operation: "add", operands: [0.1, 0.2] });
    expect(requests[1]?.operands[0]).toBe(0.1 + 0.2);
    expect(requests[1]?.operands[1]).toBe(0.1);
    expect(state.result).toBe(0.1 + 0.2 + 0.1);
    expect(mainDisplay(state)).toBe("0.4");
  });

  it("normalizes a negative zero result", () => {
    const { state } = drive(["1", "sqrt"], () => ({ ok: true, result: -0 }));
    expect(mainDisplay(state)).toBe("0");
  });

  it("shows a local API OVERFLOW problem", () => {
    const { state } = drive(["1", "*", "1", "="], () => ({
      ok: false,
      problem: { code: "OVERFLOW", title: "Overflow" },
    }));
    expect(stateName(state)).toBe("error");
    expect(mainDisplay(state)).toBe("OVERFLOW");
  });
});

describe("tape history", () => {
  it("keeps only the ten most recent completed calculations", () => {
    const calculations = Array.from({ length: 11 }, (_, index) => `${index + 1}+1=`);
    const tokens = calculations.flatMap((calculation) => [...calculation]);
    const { state } = drive(tokens);
    expect(state.tape).toHaveLength(10);
    expect(state.tape[0]).toEqual({ expression: "2 + 1 =", result: "3" });
    expect(state.tape.at(-1)).toEqual({ expression: "11 + 1 =", result: "12" });
  });
});
