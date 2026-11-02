#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  CALCULATE_PATH,
  ConfigError,
  callsMatch,
  parseRunbook,
  summarize,
  validateManifestShape,
  validateSidecar,
} from "./lib/config.mjs";
import { evaluateRelations } from "./lib/geometry.mjs";

const ACCEPTANCE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(ACCEPTANCE_DIR);
const requireFromFrontend = createRequire(join(REPO_ROOT, "apps", "frontend", "package.json"));
const ASSERTION_KEYS = ["visible", "hidden", "enabled", "text", "count", "url"];
const DEFAULT_TIMEOUT_MS = 30000;
const BOOT_TIMEOUT_MS = 60000;

function utcStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function gitShortSha() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "local";
}

function resolveRunId() {
  if (process.env.ACCEPTANCE_RUN_ID && process.env.ACCEPTANCE_RUN_ID.trim() !== "") {
    return process.env.ACCEPTANCE_RUN_ID.trim();
  }
  return `${gitShortSha()}-${utcStamp()}`;
}

function resolveOutDir(explicit, runId) {
  if (explicit) return resolve(REPO_ROOT, explicit);
  const scratch = process.env.OPENCODE_SCRATCH_DIR;
  if (scratch && scratch.trim() !== "") {
    return join(scratch, "acceptance", runId);
  }
  return join(process.env.TMPDIR ?? "/tmp", "opencode", "acceptance", runId);
}

function runShell(command, { cwd = REPO_ROOT, capture = false } = {}) {
  return spawnSync("sh", ["-c", command], {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function newResult(id, surface, assertions = {}) {
  return {
    id,
    surface,
    verdict: "fail",
    evidence: "",
    error: null,
    duration_ms: 0,
    assertions,
    console: { count: 0, errors: [] },
    network: { count: 0, failed: [] },
    requests: { count: 0, calls: [] },
    presses: [],
    artifacts: {},
    vision: null,
    action_performed: false,
  };
}

async function waitForFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function loadStart(page, startUrl) {
  await page.goto(startUrl, { waitUntil: "load" });
  await waitForFonts(page);
}

async function closeBrowser(browser, context, page) {
  try {
    if (page) await page.close();
  } catch {
    // Already closed.
  }
  try {
    if (context) await context.close();
  } catch {
    // Already closed.
  }
  try {
    if (browser) await browser.close();
  } catch {
    // Already closed.
  }
}

function recordRequests(result, calls, callStart) {
  const observed = calls.slice(callStart);
  result.requests = { count: observed.length, calls: observed };
}

function locatorFor(page, spec) {
  switch (spec.by) {
    case "testid":
      return page.getByTestId(spec.testid);
    case "label":
      return page.getByLabel(spec.label, { exact: spec.exact });
    case "role":
      return page.getByRole(spec.role, { name: spec.name, exact: spec.exact });
    case "text":
      return page.getByText(spec.text, { exact: spec.exact });
    case "css":
      return page.locator(spec.selector);
    default:
      throw new ConfigError(`unknown locator kind "${spec.by}"`);
  }
}

async function waitForText(locator, expected, timeout) {
  const deadline = Date.now() + timeout;
  let text = null;
  while (Date.now() < deadline) {
    text = (await locator.textContent()) ?? "";
    if (text === expected) return text;
    await sleep(50);
  }
  return text;
}

async function assertExpect(page, anchor, expect, timeout) {
  const observed = {};
  const failures = [];
  const locator = anchor ? locatorFor(page, anchor) : null;

  for (const key of ASSERTION_KEYS) {
    if (!(key in expect)) continue;
    if (key === "visible") {
      const value = await locator.isVisible();
      observed.visible = value;
      if (value !== expect.visible) failures.push(`visible ${value} !== ${expect.visible}`);
    }
    if (key === "hidden") {
      const value = !(await locator.isVisible());
      observed.hidden = value;
      if (value !== expect.hidden) failures.push(`hidden ${value} !== ${expect.hidden}`);
    }
    if (key === "enabled") {
      const value = await locator.isEnabled();
      observed.enabled = value;
      if (value !== expect.enabled) failures.push(`enabled ${value} !== ${expect.enabled}`);
    }
    if (key === "text") {
      const value = await waitForText(locator, expect.text, timeout);
      observed.text = value;
      if (value !== expect.text) failures.push(`text ${JSON.stringify(value)} !== ${JSON.stringify(expect.text)}`);
    }
    if (key === "count") {
      const value = await locator.count();
      observed.count = value;
      if (value !== expect.count) failures.push(`count ${value} !== ${expect.count}`);
    }
    if (key === "url") {
      const value = page.url();
      observed.url = value;
      if (value !== expect.url) failures.push(`url ${value} !== ${expect.url}`);
    }
  }
  return { observed, failures };
}

async function waitForIdle(page, timeout) {
  try {
    await page.waitForFunction(
      () => {
        const root = document.querySelector('[data-testid="calculator-root"]');
        return root === null || root.getAttribute("aria-busy") !== "true";
      },
      null,
      { timeout },
    );
  } catch {
    return false;
  }
  return true;
}

async function boxesFor(page, testIds) {
  const boxes = {};
  for (const testId of testIds) {
    const box = await page.getByTestId(testId).boundingBox();
    if (box === null) continue;
    boxes[testId] = {
      width: box.width,
      height: box.height,
      centerX: box.x + box.width / 2,
      right: box.x + box.width,
      top: box.y,
      bottom: box.y + box.height,
    };
  }
  return boxes;
}

function relationTestIds(relations) {
  const ids = new Set();
  for (const relation of relations) {
    const [key] = Object.keys(relation);
    for (const id of relation[key]) ids.add(id);
  }
  return [...ids];
}

async function performAction(page, context, action, anchor) {
  if (action.type === "navigate") {
    await page.goto(action.url, { waitUntil: "load" });
    return;
  }
  if (action.type === "newPage") {
    const next = await context.newPage();
    await next.goto(action.url, { waitUntil: "load" });
    return;
  }
  if (!action.target && action.type === "press") {
    await page.keyboard.press(action.value);
    return;
  }
  const locator = locatorFor(page, action.target ?? anchor);
  if (action.type === "click") await locator.click();
  if (action.type === "hover") await locator.hover();
  if (action.type === "fill") await locator.fill(action.value);
  if (action.type === "select") await locator.selectOption(action.value);
  if (action.type === "press") await locator.press(action.value);
}

async function runVision(visual, screenshotPath) {
  const verifyPath = join(homedir(), ".agents", "vision", "verify.mjs");
  if (!existsSync(verifyPath)) {
    throw new Error(`vision unavailable: capability missing at ${verifyPath}`);
  }
  try {
    const { verifyVision } = await import(pathToFileURL(verifyPath).href);
    const screenshot = readFileSync(screenshotPath).toString("base64");
    return await verifyVision({ screenshot, assertion: visual });
  } catch (error) {
    throw new Error(`vision unavailable: ${error.message}`);
  }
}

function readJson(path, label) {
  if (!existsSync(path)) throw new ConfigError(`${label} not found at ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`${label} is not valid JSON: ${error.message}`);
  }
}

function httpRequestPlan(intent) {
  const headers = { ...(intent.action?.headers ?? {}) };
  let body;
  if (intent.action?.body !== undefined) {
    body =
      typeof intent.action.body === "string" ? intent.action.body : JSON.stringify(intent.action.body);
  } else if (intent.action?.body_repeat !== undefined) {
    const { char, count } = intent.action.body_repeat;
    body = char.repeat(count);
  }
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  return {
    method: intent.anchor.method,
    path: intent.anchor.path,
    headers,
    body,
  };
}

function checkHttpExpect(expect, response, text) {
  const observed = {
    status: response.status,
    content_type: response.headers.get("content-type"),
  };
  const failures = [];
  if (expect.status !== undefined && response.status !== expect.status) {
    failures.push(`status ${response.status} !== ${expect.status}`);
  }
  if (expect.content_type !== undefined && observed.content_type !== expect.content_type) {
    failures.push(
      `content_type ${JSON.stringify(observed.content_type)} !== ${JSON.stringify(expect.content_type)}`,
    );
  }
  if (expect.body !== undefined) {
    observed.body = text;
    if (text !== expect.body) failures.push("body differs");
  }
  if (expect.body_contains !== undefined) {
    observed.body_contains = text.includes(expect.body_contains);
    if (!observed.body_contains) failures.push(`body does not contain ${JSON.stringify(expect.body_contains)}`);
  }
  let parsed;
  if (expect.code !== undefined || expect.field !== undefined || expect.json !== undefined) {
    try {
      parsed = JSON.parse(text);
      observed.json = parsed;
    } catch {
      failures.push("response is not JSON");
    }
  }
  if (parsed !== undefined) {
    if (expect.code !== undefined && parsed.code !== expect.code) {
      failures.push(`code ${JSON.stringify(parsed.code)} !== ${JSON.stringify(expect.code)}`);
    }
    if (expect.field !== undefined && parsed.field !== expect.field) {
      failures.push(`field ${JSON.stringify(parsed.field)} !== ${JSON.stringify(expect.field)}`);
    }
    if (expect.json !== undefined && JSON.stringify(parsed) !== JSON.stringify(expect.json)) {
      failures.push("json body differs");
    }
  }
  if (expect.headers?.allow !== undefined) {
    observed.allow = response.headers.get("allow");
    if (observed.allow !== expect.headers.allow) {
      failures.push(`allow ${JSON.stringify(observed.allow)} !== ${JSON.stringify(expect.headers.allow)}`);
    }
  }
  if (expect.headers?.absent !== undefined) {
    const present = expect.headers.absent.filter((name) => response.headers.has(name));
    observed.absent = present;
    if (present.length > 0) failures.push(`unexpected headers: ${present.join(", ")}`);
  }
  return { observed, failures };
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string" },
      expectations: { type: "string" },
      runbook: { type: "string" },
      out: { type: "string" },
      vision: { type: "boolean" },
      "no-vision": { type: "boolean" },
      only: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(
      "usage: node acceptance/run.mjs [--manifest <path>] [--expectations <path>] " +
        "[--runbook <path>] [--out <dir>] [--vision|--no-vision] [--only <id-prefix>]",
    );
    return 0;
  }

  const manifestPath = resolve(REPO_ROOT, values.manifest ?? "acceptance/manifest.json");
  const expectationsPath = resolve(
    REPO_ROOT,
    values.expectations ?? "acceptance/expectations.json",
  );
  let runbookPath = null;
  const useVision = values["no-vision"] ? false : true;
  const runId = resolveRunId();
  const outDir = resolveOutDir(values.out, runId);
  mkdirSync(outDir, { recursive: true });

  const ledger = {
    manifest_version: 2,
    run_id: runId,
    runbook: values.runbook ?? null,
    artifacts_dir: outDir,
    boot: { duration_ms: 0, services: [] },
    results: [],
    summary: { total: 0, passed: 0, failed: 0, fatal: 0, deferred: 0, skipped: 0 },
  };

  const finish = (override) => {
    const { exitCode: summaryExitCode, ...counts } = summarize(ledger.results);
    ledger.summary = { ...counts, boot_duration_ms: ledger.boot.duration_ms };
    writeFileSync(join(outDir, "result.json"), `${JSON.stringify(ledger, null, 2)}\n`);
    return Math.max(override ?? 0, summaryExitCode);
  };

  let exitCode = 0;
  let browser = null;
  let context = null;
  let page = null;
  let holdHandler = null;
  let holdPath = null;

  try {
    const manifest = validateManifestShape(readJson(manifestPath, "manifest"));
    const sidecar = validateSidecar(readJson(expectationsPath, "expectations"), manifest);
    ledger.runbook = values.runbook ?? manifest.runbook;
    runbookPath = resolve(REPO_ROOT, ledger.runbook);
    const runbook = parseRunbook(readFileSync(runbookPath, "utf8"));

    const selected = values.only
      ? manifest.intents.filter((intent) => intent.id.startsWith(values.only))
      : manifest.intents;
    if (selected.length === 0) throw new ConfigError(`no intents match --only "${values.only}"`);

    const bootStart = Date.now();
    runShell("docker rm -f calc-acceptance", { capture: true });
    if (process.env.ACCEPTANCE_SKIP_BUILD !== "1") {
      const build = runShell(runbook.build, { cwd: runbook.cwd });
      if (build.status !== 0) throw new Error(`runbook build failed with status ${build.status}`);
    }
    const start = runShell(runbook.start, { cwd: runbook.cwd });
    if (start.status !== 0) throw new Error(`runbook start failed with status ${start.status}`);

    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      const probe = runShell(runbook.ready, { cwd: runbook.cwd, capture: true });
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await sleep(500);
    }
    if (!ready) throw new Error(`health gate did not become ready within ${BOOT_TIMEOUT_MS}ms`);
    ledger.boot = { duration_ms: Date.now() - bootStart, services: ["calculator"] };

    const baseUrl = manifest.start_url.replace(/\/+$/, "");
    const httpIntents = selected.filter((intent) => intent.surface !== "Browser");
    for (const intent of httpIntents) {
      const started = Date.now();
      const result = newResult(intent.id, intent.surface);
      try {
        const plan = httpRequestPlan(intent);
        const response = await fetch(`${baseUrl}${plan.path}`, {
          method: plan.method,
          headers: plan.headers,
          body: plan.body,
          signal: AbortSignal.timeout(intent.timeout_ms ?? DEFAULT_TIMEOUT_MS),
        });
        const text = await response.text();
        const checked = checkHttpExpect(intent.expect, response, text);
        result.assertions = checked.observed;
        result.action_performed = true;
        if (checked.failures.length === 0) {
          result.verdict = "pass";
          result.evidence = `${plan.method} ${plan.path} -> ${response.status}`;
        } else {
          result.error = checked.failures.join("; ");
          result.evidence = `${plan.method} ${plan.path} -> ${response.status}: ${result.error}`;
        }
      } catch (error) {
        result.error = error.message;
        result.evidence = error.message;
      }
      result.duration_ms = Date.now() - started;
      ledger.results.push(result);
    }

    const browserIntents = selected.filter((intent) => intent.surface === "Browser");
    if (browserIntents.length > 0) {
      const { chromium } = requireFromFrontend("@playwright/test");
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      await context.tracing.start({ screenshots: true, snapshots: true });
      page = await context.newPage();

      let consoleErrors = [];
      let failedRequests = [];
      const calls = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("requestfailed", (request) => {
        failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? null });
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname !== CALCULATE_PATH || request.method() !== "POST") return;
        let payload = null;
        try {
          payload = request.postDataJSON();
        } catch {
          payload = null;
        }
        calls.push({
          method: request.method(),
          path: url.pathname,
          operation: payload?.operation ?? null,
          operands: payload?.operands ?? null,
        });
      });

      await loadStart(page, manifest.start_url);

      let tracePath = null;
      for (const intent of browserIntents) {
        const expectation = sidecar.intents[intent.id] ?? {};
        const started = Date.now();
        consoleErrors = [];
        failedRequests = [];
        const callStart = calls.length;
        const result = newResult(intent.id, "Browser", { before: {}, after: {} });
        const timeout = intent.timeout_ms ?? DEFAULT_TIMEOUT_MS;

        try {
          if (expectation.reset) {
            await loadStart(page, manifest.start_url);
          }
          if (expectation.viewport) {
            await page.setViewportSize(expectation.viewport);
            await waitForFonts(page);
          }
          if (expectation.hold) {
            holdHandler = async (route) => {
              await sleep(expectation.hold.ms);
              try {
                await route.continue();
              } catch {
                // The route may have been released while the hold was pending.
              }
            };
            holdPath = expectation.hold.path;
            await page.route(`**${holdPath}`, holdHandler);
          }
          if (expectation.releaseHold) {
            if (holdHandler) {
              await page.unroute(`**${holdPath}`);
              holdHandler = null;
              holdPath = null;
            }
            await page.waitForFunction(
              () => {
                const root = document.querySelector('[data-testid="calculator-root"]');
                return root?.getAttribute("aria-busy") !== "true";
              },
              null,
              { timeout },
            );
          }

          if (expectation.presses) {
            const root = page.getByTestId("calculator-root");
            for (const key of expectation.presses) {
              await root.press(key);
              result.presses.push(key);
              if (!(await waitForIdle(page, timeout))) {
                throw new Error(`calculator stayed busy after pressing ${JSON.stringify(key)}`);
              }
            }
          }

          if (intent.action) {
            const beforeShot = join(outDir, `${intent.id}-before.png`);
            await page.screenshot({ path: beforeShot, fullPage: false });
            result.artifacts.before_png = beforeShot;
          }

          const before = await assertExpect(
            page,
            intent.expect.anchor ?? intent.anchor,
            intent.expect,
            timeout,
          );
          result.assertions.before = before.observed;
          if (before.failures.length > 0) {
            throw new Error(`before gate failed: ${before.failures.join("; ")}`);
          }

          if (intent.action) {
            await performAction(page, context, intent.action, intent.anchor);
            result.action_performed = true;
            if (!holdHandler) await waitForIdle(page, timeout);
          }

          if (intent.after) {
            if (intent.after.expect) {
              const afterAnchor = intent.after.anchor ?? intent.anchor;
              const after = await assertExpect(page, afterAnchor, intent.after.expect, timeout);
              result.assertions.after = after.observed;
              if (after.failures.length > 0) {
                throw new Error(`after assertion failed: ${after.failures.join("; ")}`);
              }
            }
            if (intent.after.visual) {
              const afterShot = join(outDir, `${intent.id}-after.png`);
              await page.screenshot({ path: afterShot, fullPage: false });
              result.artifacts.after_png = afterShot;
              if (!useVision) {
                result.verdict = "deferred";
                result.evidence = "vision disabled";
                result.duration_ms = Date.now() - started;
                ledger.results.push(result);
                continue;
              }
              const verdict = await runVision(intent.after.visual, afterShot);
              if (verdict.unavailable) {
                throw new Error(
                  `vision unavailable: ${verdict.reason ?? verdict.reasoning ?? "unknown"}`,
                );
              }
              result.vision = {
                verdict: verdict.pass ? "pass" : "fail",
                confidence: verdict.confidence,
                reasoning: verdict.reasoning,
              };
              if (!verdict.pass) throw new Error(`vision failed: ${verdict.reasoning}`);
            }
          }

          if (intent.action) {
            const afterShot = join(outDir, `${intent.id}-after.png`);
            if (!result.artifacts.after_png) {
              await page.screenshot({ path: afterShot, fullPage: false });
              result.artifacts.after_png = afterShot;
            }
          }

          recordRequests(result, calls, callStart);
          if (expectation.requests) {
            if (result.requests.count !== expectation.requests.count) {
              throw new Error(
                `requests ${result.requests.count} !== expected ${expectation.requests.count}`,
              );
            }
            if (
              expectation.requests.calls &&
              !callsMatch(expectation.requests.calls, result.requests.calls)
            ) {
              throw new Error(
                `requests do not match expected calls: ${JSON.stringify(result.requests.calls)}`,
              );
            }
          }

          if (expectation.attributes?.ariaBusy !== undefined) {
            const value = await page
              .getByTestId("calculator-root")
              .getAttribute("aria-busy");
            result.assertions.ariaBusy = value;
            if ((value === "true") !== expectation.attributes.ariaBusy) {
              throw new Error(
                `aria-busy ${JSON.stringify(value)} !== ${expectation.attributes.ariaBusy}`,
              );
            }
          }

          if (expectation.geometry) {
            const boxes = await boxesFor(
              page,
              relationTestIds(expectation.geometry.relations),
            );
            const relations = evaluateRelations(expectation.geometry.relations, boxes);
            result.assertions.geometry = relations;
            const failed = relations.filter((relation) => !relation.passed);
            if (failed.length > 0) {
              throw new Error(
                `geometry failed: ${failed.map((relation) => relation.relation).join(", ")}`,
              );
            }
            if (expectation.geometry.noScroll) {
              const overflow = await page.evaluate(() => ({
                x: document.documentElement.scrollWidth - window.innerWidth,
                y: document.documentElement.scrollHeight - window.innerHeight,
              }));
              result.assertions.no_scroll = overflow;
              if (overflow.x > 1 || overflow.y > 1) {
                throw new Error(`page scrolls beyond the viewport: ${JSON.stringify(overflow)}`);
              }
            }
          }

          const performed = intent.action
            ? "before gate passed"
            : result.presses.length > 0
              ? `${result.presses.length} key press(es) applied`
              : "static intent passed";
          result.verdict = "pass";
          result.evidence = `${performed}${
            result.requests.count > 0 ? `, ${result.requests.count} request(s)` : ""
          }`;
        } catch (error) {
          result.verdict = error.message.startsWith("vision unavailable") ? "fatal" : "fail";
          result.error = error.message;
          result.evidence = error.message;
          if (result.verdict === "fail" && tracePath === null) {
            tracePath = join(outDir, "trace.zip");
            await context.tracing.stop({ path: tracePath });
            result.artifacts.trace = tracePath;
          }
        }

        result.console = { count: consoleErrors.length, errors: [...consoleErrors] };
        result.network = { count: failedRequests.length, failed: [...failedRequests] };
        if (result.requests.calls.length === 0) {
          recordRequests(result, calls, callStart);
        }
        result.duration_ms = Date.now() - started;
        ledger.results.push(result);

        if (result.verdict === "fatal") {
          exitCode = 2;
          break;
        }
      }

      if (tracePath === null && context) {
        await context.tracing.stop();
      }
      await closeBrowser(browser, context, page);
      page = null;
      context = null;
      browser = null;
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`acceptance: ${error.message}`);
      return finish(3);
    }
    console.error(`acceptance: ${error.message}`);
    ledger.results.push({
      ...newResult("boot", "Terminal"),
      verdict: "fatal",
      evidence: error.message,
      error: error.message,
    });
    exitCode = 2;
  } finally {
    try {
      await closeBrowser(browser, context, page);
    } catch {
      exitCode = exitCode || 2;
    }
    if (runbookPath !== null) {
      try {
        const runbook = parseRunbook(readFileSync(runbookPath, "utf8"));
        runShell(runbook.stop, { cwd: runbook.cwd, capture: true });
        runShell("docker rm -f calc-acceptance", { capture: true });
      } catch {
        exitCode = exitCode || 2;
      }
    }
  }

  return finish(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      console.error(`acceptance: ${error.stack ?? error.message}`);
      process.exit(3);
    });
}
