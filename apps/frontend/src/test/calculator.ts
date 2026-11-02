import { calculatorReducer, initialState } from "../features/calculator/reducer";
import type {
  CalculateInput,
  CalculateOutcome,
  CalculatorKey,
  CalculatorState,
  RequestDescriptor,
} from "../features/calculator/types";
import { fakeCalculate } from "./fake-api";

export function key(token: string): CalculatorKey {
  if (/^[0-9]$/.test(token)) {
    return { type: "digit", digit: token };
  }
  switch (token) {
    case ".":
      return { type: "dot" };
    case "+":
      return { type: "operator", operation: "add" };
    case "-":
      return { type: "operator", operation: "subtract" };
    case "*":
      return { type: "operator", operation: "multiply" };
    case "/":
      return { type: "operator", operation: "divide" };
    case "^":
      return { type: "operator", operation: "power" };
    case "=":
      return { type: "equals" };
    case "%":
      return { type: "percent" };
    case "sqrt":
      return { type: "sqrt" };
    case "sign":
      return { type: "sign" };
    case "ac":
      return { type: "ac" };
    case "backspace":
      return { type: "backspace" };
    default:
      throw new Error(`Unknown key token: ${token}`);
  }
}

export function computeOutcome(request: RequestDescriptor): CalculateOutcome {
  const outcome = fakeCalculate(request);
  if (outcome.ok) {
    return { ok: true, result: outcome.result };
  }
  return {
    ok: false,
    problem: { code: outcome.problem.code, title: outcome.problem.title },
  };
}

export type ObservedRequest = CalculateInput;

export type DriveResult = {
  state: CalculatorState;
  requests: ObservedRequest[];
};

export type Responder = (request: RequestDescriptor, index: number) => CalculateOutcome;

export function drive(
  tokens: string[],
  respond: Responder = computeOutcome,
  from: CalculatorState = initialState(),
): DriveResult {
  let state = from;
  const requests: ObservedRequest[] = [];
  for (const token of tokens) {
    state = calculatorReducer(state, { type: "press", key: key(token) });
    while (state.request !== null) {
      const request = state.request;
      requests.push({ operation: request.operation, operands: request.operands });
      const outcome = respond(request, requests.length - 1);
      state = calculatorReducer(state, { type: "settle", id: request.id, outcome });
    }
  }
  return { state, requests };
}

export function press(state: CalculatorState, token: string): CalculatorState {
  return calculatorReducer(state, { type: "press", key: key(token) });
}
