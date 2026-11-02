import { Calculator } from "../features/calculator/Calculator";
import styles from "./App.module.css";

export function App() {
  return (
    <main className={styles.page}>
      <Calculator />
    </main>
  );
}
