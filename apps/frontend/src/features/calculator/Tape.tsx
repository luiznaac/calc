import styles from "./Calculator.module.css";
import type { TapeEntry } from "./types";

type TapeProps = {
  entries: TapeEntry[];
};

export function Tape({ entries }: TapeProps) {
  return (
    <section className={styles.tape} aria-label="Calculation tape">
      <span className={styles.tapeTitle}>Tape</span>
      <ol className={styles.tapeList} data-testid="tape">
        {entries.length === 0 ? (
          <li className={styles.tapeEmpty}>No completed calculations yet.</li>
        ) : (
          entries.map((entry, index) => (
            <li key={`${entry.expression}-${index}`} className={styles.tapeRow}>
              <span>{entry.expression}</span>
              <span>{entry.result}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
