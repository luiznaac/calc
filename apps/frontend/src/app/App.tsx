import styles from "./App.module.css";

export function App() {
  return (
    <main className={styles.shell} aria-labelledby="calc-title">
      <h1 id="calc-title" className={styles.title}>
        Calculator
      </h1>
      <p className={styles.note}>
        Foundation skeleton. The calculator UI and interactions land in issue #21.
      </p>
    </main>
  );
}
