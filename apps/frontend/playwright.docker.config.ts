import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CALC_DOCKER_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["docker-smoke.spec.ts"],
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
