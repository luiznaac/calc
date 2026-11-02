import { useEffect, useRef } from "react";
import styles from "./Calculator.module.css";
import { Display } from "./Display";
import { Keypad } from "./Keypad";
import { Tape } from "./Tape";
import { keyFromKeyboard } from "./keyboard";
import { mainDisplay } from "./reducer";
import { useCalculator } from "./useCalculator";

export function Calculator() {
  const { state, press } = useCalculator();
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    root.tabIndex = 0;
    root.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const key = keyFromKeyboard(event.key, event.target);
      if (key === null) {
        return;
      }
      event.preventDefault();
      press(key);
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [press]);

  return (
    <section
      ref={rootRef}
      className={`${styles.shell} ${state.inFlight ? styles.busy : ""}`}
      data-testid="calculator-root"
      aria-label="Calculator"
      aria-busy={state.inFlight}
    >
      <header className={styles.header}>
        <h1 className={styles.title}>Calculator</h1>
        <span className={styles.revision}>rev 0.1 — immediate execution</span>
      </header>
      <div className={styles.body}>
        <section className={styles.left}>
          <div className={styles.utilities}>
            <button
              type="button"
              className={styles.utility}
              data-testid="key-backspace"
              aria-label="Backspace"
              onClick={() => press({ type: "backspace" })}
            >
              ⌫
            </button>
            <button
              type="button"
              className={styles.utility}
              data-testid="key-power"
              aria-label="Power"
              onClick={() => press({ type: "operator", operation: "power" })}
            >
              x^y
            </button>
          </div>
          <Display expression={state.expression} main={mainDisplay(state)} error={state.error} />
          <Tape entries={state.tape} />
        </section>
        <Keypad onPress={press} busy={state.inFlight} />
      </div>
    </section>
  );
}
