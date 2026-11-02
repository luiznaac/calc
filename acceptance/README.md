# Self-served acceptance

Acceptance is an agent-only, pre-PR gate. There is no CI job and no CI ledger artifact. The
implementing agent runs the repository-owned runner against the Docker image before opening a
pull request and posts the ledger gist on the PR. CI keeps its Docker smoke and Playwright smoke
journeys and never runs this manifest.

## Run

```sh
pnpm acceptance
```

`run.mjs` is the orchestration entry; the pure schema/runbook/ledger helpers live in
`lib/config.mjs` and the geometry math in `lib/geometry.mjs`, covered by `run.test.mjs`. The
runner builds the image through the `docker:build` Nx target, starts it through `runbook.md`
(`-p 8080:80` only), polls `/healthz`, executes the manifest, tears the container down and writes
the ledger. `ACCEPTANCE_SKIP_BUILD=1` reuses an existing `calc:acceptance` image for a fast
development loop.

| Flag                       | Meaning                                                  |
| -------------------------- | -------------------------------------------------------- |
| `--manifest <path>`        | Manifest to run (default `acceptance/manifest.json`).    |
| `--expectations <path>`    | Sidecar to run (default `acceptance/expectations.json`). |
| `--runbook <path>`         | Runbook to boot (default `acceptance/runbook.md`).       |
| `--out <dir>`              | Artifact directory; defaults to the scratch dir below.   |
| `--vision` / `--no-vision` | Vision on (default) or visual intents marked `deferred`. |
| `--only <id-prefix>`       | Run matching intents only; still boots and tears down.   |

`ACCEPTANCE_RUN_ID` overrides the run id; otherwise it is `<short-sha>-<UTC>`.

## Artifacts

Everything produced at run time is written under
`$OPENCODE_SCRATCH_DIR/acceptance/<run-id>/` (or `<tmp>/opencode/acceptance/<run-id>/`), never
committed:

```text
result.json                 ledger v2 plus the additive requests/assertions fields
<intent-id>-before.png      screenshot before a Browser intent's action
<intent-id>-after.png       screenshot after a Browser intent's action
trace.zip                   Playwright trace, written only on the first failure
```

The ledger keeps the shared v2 shape: `manifest_version`, `run_id`, `runbook`, `artifacts_dir`,
`boot`, per-intent `results` (`id`, `surface`, `verdict`, `evidence`, `error`, `duration_ms`,
`assertions`, `console`, `network`, `artifacts`, `vision`, `action_performed`) and
`summary` (`total`, `passed`, `failed`, `fatal`, `deferred`, `skipped`, `boot_duration_ms`).
Repository additions are `results[].requests` (`count` plus observed `calls`) and the observed
`assertions.geometry` / `assertions.no_scroll` values.

## Exit codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| `0`  | Every intent passed or was deferred.                          |
| `1`  | At least one intent failed.                                   |
| `2`  | Fatal: boot, health gate, browser launch or exhausted vision. |
| `3`  | Configuration/schema error.                                   |

The ledger is written even after a fatal error.

## Manifest and sidecar

`manifest.json` is strict manifest v2 (`manifest_version`, `runbook`, `start_url`, ordered
`intents`). Browser intents use the v2 locator/action/assertion vocabulary; HTTP intents use the
free-form `anchor`/`expect`/`action` branch that v2 leaves unvalidated for non-Browser surfaces.
`expectations.json` carries only what v2 cannot express, keyed by manifest intent id:
`reset`, `requests` (count and ordered calls), `viewport`, `geometry` (relations and no-scroll),
`attributes` (`ariaBusy`), `hold` and `releaseHold`. Unknown ids and unknown keys are rejected.

HTTP conventions: `anchor.method` + `anchor.path`; `expect.status`, `expect.content_type`,
`expect.code`, `expect.field`, `expect.body`, `expect.body_contains`, `expect.json`,
`expect.headers.allow`, `expect.headers.absent`; `action.headers`, `action.body` (an object is
sent as JSON, a string is sent raw) and `action.body_repeat` (for the 1 MiB case).

## Reading a failure

1. Read `result.json` and find the first result whose `verdict` is `fail` or `fatal`.
2. `error` names the failed assertion; `assertions.before` and `assertions.after` hold what the
   browser observed.
3. Open the intent's `before`/`after` screenshots and, for the first failure, `trace.zip` with
   `pnpm --filter frontend exec playwright show-trace <path>`.
4. `requests` shows the observed calculate calls; compare them with the sidecar expectation.
5. A `deferred` result is a visual intent skipped by `--no-vision`; rerun without it.

The implementing agent files one labelled follow-up issue per failed or deferred intent. The runner
never touches the issue tracker.

## Intent inventory

- `ui-loads`: the container serves the SPA at the start URL. The shared v2 schema has no Container
  surface, so this is the Browser surface check that proves the nginx + Go container serves the SPA.
- 22 HTTP intents: health, success, every API error class except `INVALID_NUMBER` and
  `INTERNAL_ERROR` (three request-shape variants for `INVALID_JSON`), and the four non-events
  (`OPTIONS` with no CORS, trailing slash, lenient unknown fields, tolerated charset).
- Eight transition-row groups (`row-initial`, `row-entry`, `row-awaiting`, `row-entry-right`,
  `row-computed-right`, `row-result`, `row-error`, `row-inflight`) with request counts and
  non-event assertions on every step.
- Five geometry intents: the 20 bounding-box relations at 1280×900, 390×844, 844×390, 667×375
  and 568×320, with no page scroll.
- Two vision intents: `visual-percent-worked` and `visual-percent-result`, against the committed
  human reference `reference/percent-worked.png`.

The manifest leaves `INVALID_NUMBER` out by decision, but the HTTP adapter can still reach it
through a JSON number that overflows `float64` (for example `1e400`); it stays covered at the
adapter/domain level. `INTERNAL_ERROR` needs fault injection and stays unit-only.
