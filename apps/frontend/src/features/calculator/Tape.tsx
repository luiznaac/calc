import { useEffect, useRef } from "react";
import styles from "./Calculator.module.css";
import type { TapeEntry } from "./types";

type TapeProps = {
  entries: TapeEntry[];
};

export function Tape({ entries }: TapeProps) {
  const newestRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    newestRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries]);

  return (
    <section className={styles.tape} aria-label="Calculation tape">
      <span className={styles.tapeTitle}>Tape</span>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scrollable list needs keyboard focus */}
      <ol className={styles.tapeList} data-testid="tape" tabIndex={0} aria-label="Tape entries">
        {entries.length === 0 ? (
          <li className={styles.tapeEmpty}>No completed calculations yet.</li>
        ) : (
          entries.map((entry, index) => (
            <li
              key={`${entry.expression}-${index}`}
              ref={index === entries.length - 1 ? newestRef : undefined}
              className={styles.tapeRow}
            >
              <span>{entry.expression}</span>
              <span>{entry.result}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
