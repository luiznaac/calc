export type BinaryOperation = "add" | "subtract" | "multiply" | "divide" | "power";

export type CalculateOperation = BinaryOperation | "sqrt";

export type Problem = {
  code: string;
  title: string;
  detail?: string;
  status?: number;
  type?: string;
  field?: string;
  instance?: string;
};

export type CalculateInput = {
  operation: CalculateOperation;
  operands: number[];
};

export type CalculateOutcome = { ok: true; result: number } | { ok: false; problem: Problem };

export type RequestTarget =
  "binary-equals" | "binary-operator" | "sqrt-entry" | "sqrt-computed" | "sqrt-result";

export type RequestDescriptor = {
  id: number;
  operation: CalculateOperation;
  operands: number[];
  target: RequestTarget;
  expression: string;
  nextOperator: BinaryOperation | null;
};

export type TapeEntry = {
  expression: string;
  result: string;
};

export type CalculatorState = {
  entry: string | null;
  left: number | null;
  pending: BinaryOperation | null;
  computed: number | null;
  result: number | null;
  expression: string;
  error: Problem | null;
  inFlight: boolean;
  percentOnResult: boolean;
  tape: TapeEntry[];
  request: RequestDescriptor | null;
  requestCounter: number;
};

export type CalculatorKey =
  | { type: "digit"; digit: string }
  | { type: "dot" }
  | { type: "operator"; operation: BinaryOperation }
  | { type: "equals" }
  | { type: "percent" }
  | { type: "sqrt" }
  | { type: "sign" }
  | { type: "ac" }
  | { type: "backspace" };

export type CalculatorAction =
  { type: "press"; key: CalculatorKey } | { type: "settle"; id: number; outcome: CalculateOutcome };

export type CalculatorStateName =
  | "initial"
  | "entry"
  | "awaiting"
  | "entry-right"
  | "computed-right"
  | "result"
  | "error"
  | "inFlight";
