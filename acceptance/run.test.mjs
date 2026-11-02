import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigError,
  callsMatch,
  parseRunbook,
  resolveExitCode,
  summarize,
  validateSidecar,
} from "./lib/config.mjs";
import { evaluateRelations } from "./lib/geometry.mjs";

const RUNBOOK = `# Runbook

| | |
|---|---|
| start | \`docker run --rm -d --name calc-acceptance -p 8080:80 calc:acceptance\` |
| ready | \`curl -fsS http://localhost:8080/healthz\` |
| port  | \`8080\` |
| stop  | \`docker stop calc-acceptance\` |
| build | \`docker build -t calc:acceptance .\` |
| cwd   | \`.\` |
`;

const MANIFEST = {
  manifest_version: 2,
  runbook: "acceptance/runbook.md",
  start_url: "http://localhost:8080/",
  intents: [
    {
      id: "http-health",
      surface: "HTTP",
      intent: "GET /healthz returns ok",
      anchor: { method: "GET", path: "/healthz" },
      expect: { status: 200, body: "ok\n" },
    },
    {
      id: "row-result-equals",
      surface: "Browser",
      intent: "equals shows the sum",
      anchor: { by: "testid", testid: "key-equals" },
      expect: { visible: true, enabled: true },
      action: { type: "click" },
      after: {
        anchor: { by: "testid", testid: "display-main" },
        expect: { text: "3" },
      },
    },
  ],
};

test("parseRunbook reads the bootstrap commands from the runbook table", () => {
  assert.deepEqual(parseRunbook(RUNBOOK), {
    start: "docker run --rm -d --name calc-acceptance -p 8080:80 calc:acceptance",
    ready: "curl -fsS http://localhost:8080/healthz",
    port: "8080",
    stop: "docker stop calc-acceptance",
    build: "docker build -t calc:acceptance .",
    cwd: ".",
  });
});

test("parseRunbook rejects a runbook without the required rows", () => {
  assert.throws(() => parseRunbook("| | |\n|---|---|\n| start | `x` |\n"), ConfigError);
});

test("validateSidecar accepts known ids and the supported extension keys", () => {
  const sidecar = {
    expectations_version: 1,
    intents: {
      "row-result-equals": {
        reset: true,
        requests: {
          count: 1,
          calls: [
            { method: "POST", path: "/api/v1/calculate", operation: "add", operands: [1, 2] },
          ],
        },
      },
      "http-health": { requests: { count: 0 } },
    },
  };
  assert.deepEqual(validateSidecar(sidecar, MANIFEST), sidecar);
});

test("validateSidecar rejects an unknown intent id", () => {
  assert.throws(
    () =>
      validateSidecar(
        { expectations_version: 1, intents: { "row-nope": { requests: { count: 0 } } } },
        MANIFEST,
      ),
    ConfigError,
  );
});

test("validateSidecar rejects an unknown intent key", () => {
  assert.throws(
    () =>
      validateSidecar(
        {
          expectations_version: 1,
          intents: { "row-result-equals": { requests: { count: 0 }, surprise: true } },
        },
        MANIFEST,
      ),
    ConfigError,
  );
});

test("validateSidecar requires method and path on every request call", () => {
  assert.throws(
    () =>
      validateSidecar(
        {
          expectations_version: 1,
          intents: {
            "row-result-equals": { requests: { count: 1, calls: [{ operation: "add", operands: [1, 2] }] } },
          },
        },
        MANIFEST,
      ),
    ConfigError,
  );
});

test("callsMatch compares operation and operands in order", () => {
  const expected = [
    { method: "POST", path: "/api/v1/calculate", operation: "add", operands: [5, 4] },
    { method: "POST", path: "/api/v1/calculate", operation: "multiply", operands: [9, 2] },
  ];
  const observed = [
    { method: "POST", path: "/api/v1/calculate", operation: "add", operands: [5, 4] },
    { method: "POST", path: "/api/v1/calculate", operation: "multiply", operands: [9, 2] },
  ];
  assert.equal(callsMatch(expected, observed), true);
  assert.equal(callsMatch(expected, observed.slice(0, 1)), false);
  assert.equal(
    callsMatch(expected, [{ ...observed[0], operands: [5, 3] }, observed[1]]),
    false,
  );
});

test("evaluateRelations applies the column, vertical, function-row and right-of rules", () => {
  const boxes = {
    "key-7": { width: 100, height: 60, centerX: 100, right: 150, top: 0, bottom: 60 },
    "key-4": { width: 100, height: 60, centerX: 102, right: 152, top: 62, bottom: 122 },
    "key-ac": { width: 100, height: 40, centerX: 100, right: 150, top: -41, bottom: -1 },
    "key-divide": { width: 100, height: 60, centerX: 260, right: 310, top: 0, bottom: 60 },
  };
  const results = evaluateRelations(
    [
      { above: ["key-7", "key-4"] },
      { functionAbove: ["key-ac", "key-7"] },
      { rightOf: ["key-divide", "key-7"] },
    ],
    boxes,
  );
  assert.deepEqual(
    results.map((result) => result.passed),
    [true, true, true],
  );
});

test("evaluateRelations fails a column that drifts past the tolerance", () => {
  const boxes = {
    "key-7": { width: 100, height: 60, centerX: 100, right: 150, top: 0, bottom: 60 },
    "key-4": { width: 100, height: 60, centerX: 130, right: 180, top: 62, bottom: 122 },
  };
  const results = evaluateRelations([{ above: ["key-7", "key-4"] }], boxes);
  assert.equal(results[0].passed, false);
});

test("resolveExitCode keeps a fatal override and surfaces a failed intent", () => {
  assert.equal(resolveExitCode([{ verdict: "pass" }], 0), 0);
  assert.equal(resolveExitCode([{ verdict: "fail" }], 0), 1);
  assert.equal(resolveExitCode([{ verdict: "pass" }], 2), 2);
  assert.equal(resolveExitCode([{ verdict: "fatal" }], 0), 2);
});

test("summarize counts verdicts and picks the exit code", () => {
  assert.deepEqual(summarize([{ verdict: "pass" }, { verdict: "deferred" }]), {
    total: 2,
    passed: 1,
    failed: 0,
    fatal: 0,
    deferred: 1,
    skipped: 0,
    exitCode: 0,
  });
  assert.equal(summarize([{ verdict: "pass" }, { verdict: "fail" }]).exitCode, 1);
  assert.equal(summarize([{ verdict: "fatal" }]).exitCode, 2);
});
