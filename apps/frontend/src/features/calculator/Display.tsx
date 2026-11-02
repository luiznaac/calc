import styles from "./Calculator.module.css";
import type { Problem } from "./types";

type DisplayProps = {
  expression: string;
  main: string;
  error: Problem | null;
};

export function Display({ expression, main, error }: DisplayProps) {
  return (
    <section className={styles.display} aria-label="Display">
      <p className={styles.expressionLine} data-testid="expression-line" aria-label="Expression">
        {expression}
      </p>
      <output className={styles.mainLine} data-testid="display-main" aria-label="Result">
        {main}
      </output>
      <div
        className={`${styles.errorPanel} ${error === null ? styles.errorPanelIdle : ""}`}
        data-testid="error-panel"
        role="alert"
        aria-live="assertive"
      >
        {error !== null && (
          <>
            <strong className={styles.errorTitle}>{error.title}</strong>
            {error.detail !== undefined && <span>{error.detail}</span>}
          </>
        )}
      </div>
    </section>
  );
}
