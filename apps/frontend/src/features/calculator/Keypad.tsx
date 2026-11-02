import styles from "./Calculator.module.css";
import type { CalculatorKey } from "./types";

type KeyVariant = "keyClear" | "keyFunction" | "keyDigit" | "keyOperator" | "keyEquals";

type KeySpec = {
  testId: string;
  label: string;
  ariaLabel: string;
  variant: KeyVariant;
  key: CalculatorKey;
};

const KEYS: KeySpec[] = [
  {
    testId: "key-ac",
    label: "AC",
    ariaLabel: "All clear",
    variant: "keyClear",
    key: { type: "ac" },
  },
  {
    testId: "key-sqrt",
    label: "√",
    ariaLabel: "Square root",
    variant: "keyFunction",
    key: { type: "sqrt" },
  },
  {
    testId: "key-sign",
    label: "±",
    ariaLabel: "Negate",
    variant: "keyFunction",
    key: { type: "sign" },
  },
  {
    testId: "key-percent",
    label: "%",
    ariaLabel: "Percent",
    variant: "keyFunction",
    key: { type: "percent" },
  },
  {
    testId: "key-7",
    label: "7",
    ariaLabel: "7",
    variant: "keyDigit",
    key: { type: "digit", digit: "7" },
  },
  {
    testId: "key-8",
    label: "8",
    ariaLabel: "8",
    variant: "keyDigit",
    key: { type: "digit", digit: "8" },
  },
  {
    testId: "key-9",
    label: "9",
    ariaLabel: "9",
    variant: "keyDigit",
    key: { type: "digit", digit: "9" },
  },
  {
    testId: "key-divide",
    label: "÷",
    ariaLabel: "Divide",
    variant: "keyOperator",
    key: { type: "operator", operation: "divide" },
  },
  {
    testId: "key-4",
    label: "4",
    ariaLabel: "4",
    variant: "keyDigit",
    key: { type: "digit", digit: "4" },
  },
  {
    testId: "key-5",
    label: "5",
    ariaLabel: "5",
    variant: "keyDigit",
    key: { type: "digit", digit: "5" },
  },
  {
    testId: "key-6",
    label: "6",
    ariaLabel: "6",
    variant: "keyDigit",
    key: { type: "digit", digit: "6" },
  },
  {
    testId: "key-multiply",
    label: "×",
    ariaLabel: "Multiply",
    variant: "keyOperator",
    key: { type: "operator", operation: "multiply" },
  },
  {
    testId: "key-1",
    label: "1",
    ariaLabel: "1",
    variant: "keyDigit",
    key: { type: "digit", digit: "1" },
  },
  {
    testId: "key-2",
    label: "2",
    ariaLabel: "2",
    variant: "keyDigit",
    key: { type: "digit", digit: "2" },
  },
  {
    testId: "key-3",
    label: "3",
    ariaLabel: "3",
    variant: "keyDigit",
    key: { type: "digit", digit: "3" },
  },
  {
    testId: "key-subtract",
    label: "−",
    ariaLabel: "Subtract",
    variant: "keyOperator",
    key: { type: "operator", operation: "subtract" },
  },
  {
    testId: "key-0",
    label: "0",
    ariaLabel: "0",
    variant: "keyDigit",
    key: { type: "digit", digit: "0" },
  },
  {
    testId: "key-dot",
    label: ".",
    ariaLabel: "Decimal point",
    variant: "keyDigit",
    key: { type: "dot" },
  },
  {
    testId: "key-equals",
    label: "=",
    ariaLabel: "Equals",
    variant: "keyEquals",
    key: { type: "equals" },
  },
  {
    testId: "key-add",
    label: "+",
    ariaLabel: "Add",
    variant: "keyOperator",
    key: { type: "operator", operation: "add" },
  },
];

type KeypadProps = {
  onPress: (key: CalculatorKey) => void;
  busy: boolean;
};

export function Keypad({ onPress, busy }: KeypadProps) {
  return (
    <div className={styles.keypad} role="group" aria-label="Keypad" aria-busy={busy}>
      {KEYS.map((spec) => (
        <button
          key={spec.testId}
          type="button"
          className={`${styles.key} ${styles[spec.variant]}`}
          data-testid={spec.testId}
          aria-label={spec.ariaLabel}
          onClick={() => onPress(spec.key)}
        >
          {spec.label}
        </button>
      ))}
    </div>
  );
}
