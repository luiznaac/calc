import { appendDigit, appendDot, backspace, toggleSign } from "../../lib/entry";
import { formatNumber, percentOf } from "../../lib/format";
import type {
  BinaryOperation,
  CalculatorAction,
  CalculatorKey,
  CalculatorState,
  CalculatorStateName,
  Problem,
  RequestDescriptor,
  RequestTarget,
  TapeEntry,
} from "./types";

const OPERATOR_SYMBOLS: Record<BinaryOperation, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  power: "^",
};

const LOCAL_OVERFLOW: Problem = {
  code: "OVERFLOW",
  title: "Overflow",
  detail: "The result is outside the representable range.",
};

export function initialState(): CalculatorState {
  return {
    entry: null,
    left: null,
    pending: null,
    computed: null,
    result: null,
    expression: "",
    error: null,
    inFlight: false,
    percentOnResult: false,
    tape: [],
    request: null,
    requestCounter: 0,
  };
}

export function stateName(state: CalculatorState): CalculatorStateName {
  if (state.inFlight) {
    return "inFlight";
  }
  if (state.error !== null) {
    return "error";
  }
  if (state.entry !== null) {
    return state.pending === null ? "entry" : "entry-right";
  }
  if (state.computed !== null && state.pending !== null) {
    return "computed-right";
  }
  if (state.pending !== null) {
    return "awaiting";
  }
  if (state.result !== null) {
    return "result";
  }
  return "initial";
}

export function mainDisplay(state: CalculatorState): string {
  if (state.error !== null) {
    return state.error.code;
  }
  if (state.entry !== null) {
    return state.entry === "-0" ? "0" : state.entry;
  }
  if (state.computed !== null) {
    return formatNumber(state.computed);
  }
  if (state.result !== null) {
    return formatNumber(state.result);
  }
  if (state.pending !== null && state.left !== null) {
    return formatNumber(state.left);
  }
  return "0";
}

function pendingExpression(state: CalculatorState): string {
  const left = state.left ?? 0;
  const symbol = state.pending === null ? "" : OPERATOR_SYMBOLS[state.pending];
  return `${formatNumber(left)} ${symbol}`.trimEnd();
}

type BinaryOperands = {
  left: number;
  right: number;
  operation: BinaryOperation;
  base: string;
};

function binaryOperands(state: CalculatorState): BinaryOperands | null {
  if (state.pending === null || (state.entry === null && state.computed === null)) {
    return null;
  }
  const left = state.left ?? 0;
  const right = state.entry !== null ? Number.parseFloat(state.entry) : (state.computed ?? 0);
  return {
    left,
    right,
    operation: state.pending,
    base: `${formatNumber(left)} ${OPERATOR_SYMBOLS[state.pending]} ${formatNumber(right)}`,
  };
}

function withRequest(
  state: CalculatorState,
  operation: RequestDescriptor["operation"],
  operands: number[],
  target: RequestTarget,
  expression: string,
  nextOperator: BinaryOperation | null = null,
): CalculatorState {
  const id = state.requestCounter + 1;
  const request: RequestDescriptor = {
    id,
    operation,
    operands,
    target,
    expression,
    nextOperator,
  };
  return {
    ...state,
    expression,
    inFlight: true,
    request,
    requestCounter: id,
  };
}

function withTape(state: CalculatorState, expression: string, value: number): TapeEntry[] {
  return [...state.tape, { expression, result: formatNumber(value) }];
}

function withLocalError(state: CalculatorState, expression: string): CalculatorState {
  return {
    ...state,
    entry: null,
    computed: null,
    result: null,
    error: LOCAL_OVERFLOW,
    expression,
  };
}

function startFresh(state: CalculatorState): CalculatorState {
  return {
    ...initialState(),
    tape: state.tape,
    requestCounter: state.requestCounter,
  };
}

function onDigit(state: CalculatorState, digit: string): CalculatorState {
  switch (stateName(state)) {
    case "initial":
      return {
        ...state,
        entry: digit,
        left: null,
        pending: null,
        computed: null,
        result: null,
        expression: "",
        percentOnResult: false,
      };
    case "entry":
      return { ...state, entry: appendDigit(state.entry, digit) };
    case "awaiting":
      return { ...state, entry: digit };
    case "entry-right":
      return { ...state, entry: appendDigit(state.entry, digit) };
    case "computed-right":
      return {
        ...state,
        entry: digit,
        computed: null,
        expression: pendingExpression(state),
      };
    case "result":
      return {
        ...state,
        entry: digit,
        left: null,
        pending: null,
        computed: null,
        result: null,
        expression: "",
        percentOnResult: false,
      };
    default:
      return state;
  }
}

function onDot(state: CalculatorState): CalculatorState {
  switch (stateName(state)) {
    case "initial":
      return {
        ...state,
        entry: "0.",
        left: null,
        pending: null,
        computed: null,
        result: null,
        expression: "",
        percentOnResult: false,
      };
    case "entry":
      return { ...state, entry: appendDot(state.entry) };
    case "awaiting":
      return { ...state, entry: "0." };
    case "entry-right":
      return { ...state, entry: appendDot(state.entry) };
    case "computed-right":
      return {
        ...state,
        entry: "0.",
        computed: null,
        expression: pendingExpression(state),
      };
    case "result":
      return {
        ...state,
        entry: "0.",
        left: null,
        pending: null,
        computed: null,
        result: null,
        expression: "",
        percentOnResult: false,
      };
    default:
      return state;
  }
}

function onOperator(state: CalculatorState, operation: BinaryOperation): CalculatorState {
  const symbol = OPERATOR_SYMBOLS[operation];
  switch (stateName(state)) {
    case "initial":
      return {
        ...state,
        left: 0,
        pending: operation,
        entry: null,
        result: null,
        expression: `0 ${symbol}`,
        percentOnResult: false,
      };
    case "entry": {
      const left = Number.parseFloat(state.entry ?? "0");
      return {
        ...state,
        left,
        entry: null,
        pending: operation,
        expression: `${formatNumber(left)} ${symbol}`,
        percentOnResult: false,
      };
    }
    case "awaiting":
      return {
        ...state,
        pending: operation,
        expression: `${formatNumber(state.left ?? 0)} ${symbol}`,
      };
    case "entry-right":
    case "computed-right": {
      const operands = binaryOperands(state);
      if (operands === null) {
        return state;
      }
      return withRequest(
        state,
        operands.operation,
        [operands.left, operands.right],
        "binary-operator",
        operands.base,
        operation,
      );
    }
    case "result":
      return {
        ...state,
        left: state.result,
        result: null,
        pending: operation,
        entry: null,
        expression: `${formatNumber(state.result ?? 0)} ${symbol}`,
        percentOnResult: false,
      };
    default:
      return state;
  }
}

function onEquals(state: CalculatorState): CalculatorState {
  switch (stateName(state)) {
    case "entry-right":
    case "computed-right": {
      const operands = binaryOperands(state);
      if (operands === null) {
        return state;
      }
      return withRequest(
        state,
        operands.operation,
        [operands.left, operands.right],
        "binary-equals",
        `${operands.base} =`,
      );
    }
    default:
      return state;
  }
}

function onPercent(state: CalculatorState): CalculatorState {
  switch (stateName(state)) {
    case "entry": {
      const value = Number.parseFloat(state.entry ?? "0") / 100;
      if (!Number.isFinite(value)) {
        return withLocalError(state, "");
      }
      return {
        ...state,
        entry: null,
        result: value,
        expression: "",
        percentOnResult: true,
      };
    }
    case "entry-right": {
      const left = state.left ?? 0;
      const rate = Number.parseFloat(state.entry ?? "0");
      const percentOfLeft =
        state.pending === "add" || state.pending === "subtract" || state.pending === "power";
      const value = percentOfLeft ? percentOf(left, rate) : rate / 100;
      const attempted = `${formatNumber(left)} ${OPERATOR_SYMBOLS[state.pending ?? "add"]} ${state.entry ?? "0"} %`;
      if (!Number.isFinite(value)) {
        return withLocalError(state, attempted);
      }
      return {
        ...state,
        entry: null,
        computed: value,
        expression: `${formatNumber(left)} ${OPERATOR_SYMBOLS[state.pending ?? "add"]} ${formatNumber(value)}`,
        percentOnResult: true,
      };
    }
    case "result": {
      if (state.percentOnResult || state.result === null) {
        return state;
      }
      return {
        ...state,
        result: state.result / 100,
        expression: "",
        percentOnResult: true,
      };
    }
    default:
      return state;
  }
}

function onSqrt(state: CalculatorState): CalculatorState {
  switch (stateName(state)) {
    case "entry": {
      const value = Number.parseFloat(state.entry ?? "0");
      return withRequest(state, "sqrt", [value], "sqrt-entry", `√(${formatNumber(value)})`);
    }
    case "entry-right": {
      const value = Number.parseFloat(state.entry ?? "0");
      const expression = `${pendingExpression(state)} √(${formatNumber(value)})`;
      return withRequest(state, "sqrt", [value], "sqrt-computed", expression);
    }
    case "computed-right": {
      const value = state.computed ?? 0;
      const expression = `${pendingExpression(state)} √(${formatNumber(value)})`;
      return withRequest(state, "sqrt", [value], "sqrt-computed", expression);
    }
    case "result": {
      const value = state.result ?? 0;
      return withRequest(state, "sqrt", [value], "sqrt-result", `√(${formatNumber(value)})`);
    }
    default:
      return state;
  }
}

function onSign(state: CalculatorState): CalculatorState {
  switch (stateName(state)) {
    case "entry":
    case "entry-right":
      return { ...state, entry: toggleSign(state.entry ?? "0") };
    case "computed-right": {
      const computed = state.computed ?? 0;
      const next = computed === 0 ? computed : -computed;
      return {
        ...state,
        computed: next,
        expression: `${pendingExpression(state)} ${formatNumber(next)}`,
      };
    }
    case "result": {
      const result = state.result ?? 0;
      return {
        ...state,
        result: result === 0 ? result : -result,
        expression: "",
      };
    }
    default:
      return state;
  }
}

function onBackspace(state: CalculatorState): CalculatorState {
  switch (stateName(state)) {
    case "entry":
    case "entry-right":
      return { ...state, entry: backspace(state.entry) };
    default:
      return state;
  }
}

function press(state: CalculatorState, key: CalculatorKey): CalculatorState {
  if (state.inFlight) {
    return state;
  }
  if (key.type === "ac") {
    return { ...initialState(), requestCounter: state.requestCounter };
  }
  if (state.error !== null) {
    if (key.type === "digit") {
      return { ...startFresh(state), entry: key.digit };
    }
    if (key.type === "dot") {
      return { ...startFresh(state), entry: "0." };
    }
    return state;
  }

  switch (key.type) {
    case "digit":
      return onDigit(state, key.digit);
    case "dot":
      return onDot(state);
    case "operator":
      return onOperator(state, key.operation);
    case "equals":
      return onEquals(state);
    case "percent":
      return onPercent(state);
    case "sqrt":
      return onSqrt(state);
    case "sign":
      return onSign(state);
    case "backspace":
      return onBackspace(state);
  }
}

function settle(
  state: CalculatorState,
  action: Extract<CalculatorAction, { type: "settle" }>,
): CalculatorState {
  const request = state.request;
  if (request === null || request.id !== action.id) {
    return state;
  }
  if (!action.outcome.ok) {
    return {
      ...state,
      inFlight: false,
      request: null,
      entry: null,
      computed: null,
      expression: request.expression,
      error: action.outcome.problem,
    };
  }

  const value = action.outcome.result;
  switch (request.target) {
    case "binary-operator": {
      const next = request.nextOperator ?? "add";
      return {
        ...state,
        inFlight: false,
        request: null,
        left: value,
        pending: next,
        entry: null,
        computed: null,
        result: null,
        expression: `${formatNumber(value)} ${OPERATOR_SYMBOLS[next]}`,
        percentOnResult: false,
      };
    }
    case "binary-equals":
      return {
        ...state,
        inFlight: false,
        request: null,
        left: null,
        pending: null,
        entry: null,
        computed: null,
        result: value,
        expression: request.expression,
        tape: withTape(state, request.expression, value),
        percentOnResult: false,
      };
    case "sqrt-entry":
      return {
        ...state,
        inFlight: false,
        request: null,
        left: null,
        pending: null,
        entry: null,
        computed: null,
        result: value,
        expression: request.expression,
        tape: withTape(state, request.expression, value),
        percentOnResult: false,
      };
    case "sqrt-computed":
      return {
        ...state,
        inFlight: false,
        request: null,
        entry: null,
        computed: value,
        expression: request.expression,
        percentOnResult: false,
      };
    case "sqrt-result":
      return {
        ...state,
        inFlight: false,
        request: null,
        result: value,
        expression: request.expression,
        tape: withTape(state, request.expression, value),
        percentOnResult: false,
      };
  }
}

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  if (action.type === "settle") {
    return settle(state, action);
  }
  return press(state, action.key);
}
