export const CALCULATE_PATH = "/api/v1/calculate";
const REQUIRED_RUNBOOK_ROWS = ["start", "ready", "stop", "build", "port", "cwd"];
const SURFACES = ["HTTP", "Browser", "Terminal"];
const LOCATOR_KINDS = ["role", "label", "text", "testid", "css"];
const ACTION_TYPES = ["navigate", "newPage", "click", "hover", "fill", "select", "press"];
const SIDECAR_KEYS = [
  "reset",
  "requests",
  "viewport",
  "geometry",
  "attributes",
  "hold",
  "releaseHold",
];
const RELATION_KEYS = ["above", "rightOf", "functionAbove"];

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) throw new ConfigError(`${label} must be an object`);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`${label} must be a non-empty string`);
  }
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new ConfigError(`${label} must be a boolean`);
}

function requireInteger(value, label, { positive = false } = {}) {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) {
    throw new ConfigError(`${label} must be ${positive ? "a positive" : "a non-negative"} integer`);
  }
}

function rejectUnknownKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new ConfigError(`${label} has unknown key "${key}"`);
  }
}

function stripCodeCell(cell) {
  const match = cell.match(/^`([^`]*)`$/);
  return (match ? match[1] : cell).trim();
}

export function parseRunbook(markdown) {
  requireString(markdown, "runbook");
  const rows = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([A-Za-z]+)\s*\|\s*(.*?)\s*\|$/);
    if (!match) continue;
    rows[match[1].toLowerCase()] = stripCodeCell(match[2]);
  }
  for (const key of REQUIRED_RUNBOOK_ROWS) {
    if (rows[key] === undefined || rows[key] === "") {
      throw new ConfigError(`runbook is missing the ${key} row`);
    }
  }
  return rows;
}

function validateLocator(locator, label) {
  requireObject(locator, label);
  if (!LOCATOR_KINDS.includes(locator.by)) {
    throw new ConfigError(`${label}.by must be one of ${LOCATOR_KINDS.join(", ")}`);
  }
}

export function validateManifestShape(manifest) {
  requireObject(manifest, "manifest");
  if (manifest.manifest_version !== 2) {
    throw new ConfigError("manifest.manifest_version must be 2");
  }
  requireString(manifest.runbook, "manifest.runbook");
  if (!Array.isArray(manifest.intents) || manifest.intents.length === 0) {
    throw new ConfigError("manifest.intents must be a non-empty array");
  }
  if (manifest.start_url !== undefined) requireString(manifest.start_url, "manifest.start_url");
  const seen = new Set();
  for (const intent of manifest.intents) {
    requireObject(intent, "manifest intent");
    requireString(intent.id, "intent.id");
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(intent.id)) {
      throw new ConfigError(`intent id "${intent.id}" is not a slug`);
    }
    if (seen.has(intent.id)) throw new ConfigError(`duplicate intent id "${intent.id}"`);
    seen.add(intent.id);
    if (!SURFACES.includes(intent.surface)) {
      throw new ConfigError(`intent "${intent.id}" has unknown surface "${intent.surface}"`);
    }
    requireString(intent.intent, `intent "${intent.id}".intent`);
    if (intent.surface === "Browser") {
      validateLocator(intent.anchor, `intent "${intent.id}".anchor`);
      requireObject(intent.expect, `intent "${intent.id}".expect`);
      if (intent.action !== undefined) {
        if (!ACTION_TYPES.includes(intent.action.type)) {
          throw new ConfigError(`intent "${intent.id}" has unknown action "${intent.action.type}"`);
        }
      }
      if (intent.after !== undefined && intent.action === undefined) {
        throw new ConfigError(`intent "${intent.id}" has after without an action`);
      }
    }
  }
  if (manifest.intents.some((intent) => intent.surface === "Browser") && !manifest.start_url) {
    throw new ConfigError("manifest.start_url is required when Browser intents exist");
  }
  return manifest;
}

function validateRequests(requests, label) {
  requireObject(requests, label);
  rejectUnknownKeys(requests, ["count", "calls"], label);
  requireInteger(requests.count, `${label}.count`);
  if (requests.calls !== undefined) {
    if (!Array.isArray(requests.calls)) throw new ConfigError(`${label}.calls must be an array`);
    for (const call of requests.calls) {
      requireObject(call, `${label}.calls entry`);
      rejectUnknownKeys(call, ["method", "path", "operation", "operands"], `${label}.calls entry`);
      requireString(call.method, `${label}.calls entry.method`);
      requireString(call.path, `${label}.calls entry.path`);
      requireString(call.operation, `${label}.calls entry.operation`);
      if (!Array.isArray(call.operands)) {
        throw new ConfigError(`${label}.calls entry.operands must be an array`);
      }
    }
  }
}

function validateGeometry(geometry, label) {
  requireObject(geometry, label);
  rejectUnknownKeys(geometry, ["relations", "noScroll"], label);
  if (!Array.isArray(geometry.relations)) {
    throw new ConfigError(`${label}.relations must be an array`);
  }
  for (const relation of geometry.relations) {
    requireObject(relation, `${label}.relations entry`);
    const keys = Object.keys(relation);
    if (keys.length !== 1 || !RELATION_KEYS.includes(keys[0])) {
      throw new ConfigError(
        `${label}.relations entry must carry exactly one of ${RELATION_KEYS.join(", ")}`,
      );
    }
    const pair = relation[keys[0]];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new ConfigError(`${label}.relations ${keys[0]} must be a pair of test ids`);
    }
  }
  if (geometry.noScroll !== undefined) {
    requireBoolean(geometry.noScroll, `${label}.noScroll`);
  }
}

export function validateSidecar(sidecar, manifest) {
  requireObject(sidecar, "expectations");
  rejectUnknownKeys(sidecar, ["expectations_version", "intents"], "expectations");
  if (sidecar.expectations_version !== 1) {
    throw new ConfigError("expectations.expectations_version must be 1");
  }
  requireObject(sidecar.intents, "expectations.intents");
  const known = new Set(manifest.intents.map((intent) => intent.id));
  for (const [id, expectation] of Object.entries(sidecar.intents)) {
    if (!known.has(id)) {
      throw new ConfigError(`expectations has an unknown intent id "${id}"`);
    }
    requireObject(expectation, `expectations.intents["${id}"]`);
    rejectUnknownKeys(expectation, SIDECAR_KEYS, `expectations.intents["${id}"]`);
    if (expectation.reset !== undefined) {
      requireBoolean(expectation.reset, `expectations.intents["${id}"].reset`);
    }
    if (expectation.releaseHold !== undefined) {
      requireBoolean(expectation.releaseHold, `expectations.intents["${id}"].releaseHold`);
    }
    if (expectation.requests !== undefined) {
      validateRequests(expectation.requests, `expectations.intents["${id}"].requests`);
    }
    if (expectation.viewport !== undefined) {
      requireObject(expectation.viewport, `expectations.intents["${id}"].viewport`);
      requireInteger(expectation.viewport.width, `expectations.intents["${id}"].viewport.width`, {
        positive: true,
      });
      requireInteger(expectation.viewport.height, `expectations.intents["${id}"].viewport.height`, {
        positive: true,
      });
    }
    if (expectation.geometry !== undefined) {
      validateGeometry(expectation.geometry, `expectations.intents["${id}"].geometry`);
    }
    if (expectation.attributes !== undefined) {
      requireObject(expectation.attributes, `expectations.intents["${id}"].attributes`);
      rejectUnknownKeys(
        expectation.attributes,
        ["ariaBusy"],
        `expectations.intents["${id}"].attributes`,
      );
      if (expectation.attributes.ariaBusy !== undefined) {
        requireBoolean(
          expectation.attributes.ariaBusy,
          `expectations.intents["${id}"].attributes.ariaBusy`,
        );
      }
    }
    if (expectation.hold !== undefined) {
      requireObject(expectation.hold, `expectations.intents["${id}"].hold`);
      rejectUnknownKeys(expectation.hold, ["path", "ms"], `expectations.intents["${id}"].hold`);
      requireString(expectation.hold.path, `expectations.intents["${id}"].hold.path`);
      requireInteger(expectation.hold.ms, `expectations.intents["${id}"].hold.ms`, {
        positive: true,
      });
    }
  }
  return sidecar;
}

function sameOperands(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

export function callsMatch(expected, observed) {
  if (expected.length !== observed.length) return false;
  return expected.every((wanted, index) => {
    const seen = observed[index];
    return (
      seen.method === wanted.method.toUpperCase() &&
      seen.path === wanted.path &&
      seen.operation === wanted.operation &&
      sameOperands(wanted.operands, seen.operands)
    );
  });
}

export function summarize(results) {
  const counts = { total: results.length, passed: 0, failed: 0, fatal: 0, deferred: 0, skipped: 0 };
  for (const result of results) {
    if (result.verdict === "pass") counts.passed += 1;
    if (result.verdict === "fail") counts.failed += 1;
    if (result.verdict === "fatal") counts.fatal += 1;
    if (result.verdict === "deferred") counts.deferred += 1;
    if (result.verdict === "skipped") counts.skipped += 1;
  }
  const exitCode = counts.fatal > 0 ? 2 : counts.failed > 0 ? 1 : 0;
  return { ...counts, exitCode };
}

export function resolveExitCode(results, override = 0) {
  return Math.max(override, summarize(results).exitCode);
}
