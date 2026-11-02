# calc

[![codecov](https://codecov.io/gh/luiznaac/calc/branch/master/graph/badge.svg)](https://codecov.io/gh/luiznaac/calc)

A full-stack calculator: a Go HTTP API and a React TypeScript single-page app, packaged as one
nginx + Go container image. One JSON endpoint exposes eight operations — `add`, `subtract`,
`multiply`, `divide`, `power`, `sqrt`, `negate` and `percent` — and the UI adds contextual percent
behavior on top. The image publishes only nginx on port 80; the Go process listens on loopback and
is reached through nginx, so the UI and the API share one origin.

## Quick start (Docker)

Prerequisites: Node 22, pnpm 12 through Corepack, and Docker.

```sh
git clone https://github.com/luiznaac/calc.git
cd calc
corepack enable
pnpm install
pnpm exec nx run docker:docker:build
docker run --rm -p 8080:80 calc:acceptance
```

Open <http://localhost:8080>. The same origin serves the API, so no separate API port is published:

```sh
curl -sS http://localhost:8080/healthz
# ok
curl -sS -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1,2]}'
# {"result":3}
```

Stop the container with `Ctrl+C` (or `docker stop <container>`). `calc:acceptance` is the local tag
produced by the `docker:build` target in the `docker` project; the acceptance runbook uses the
same tag.

## Overview

The monorepo has two applications under `apps/` plus a packaging project. The Go backend is a flat
hexagonal module: domain entities and typed errors in `domain.go`, use cases in `service.go`, and
the consumer-owned port plus the HTTP and in-memory adapters in `adapters/`. The React frontend is
a Vite + TypeScript SPA whose `useReducer` state machine owns the display, keypad and keyboard
behavior, while `useCalculator` owns the request lifecycle. The `docker/` project supplies nginx
and s6-overlay files to the root `Dockerfile`, which builds both applications into one image that
starts Go before nginx and proxies `/api/*`, `/healthz` and unknown paths to `127.0.0.1:8080`.

## Local development

Local development also needs Go 1.26 or 1.27 on `PATH`. Install the workspace dependencies once:

```sh
corepack enable
pnpm install
```

Run the Go API and the Vite dev server in two terminals:

```sh
pnpm exec nx serve backend
# Go listens on 127.0.0.1:8080

pnpm exec nx serve frontend
# Vite serves http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:8080`, so the SPA talks to the local Go
process without CORS. `/healthz` is not proxied in development; poll the backend directly with
`curl http://localhost:8080/healthz`. The Docker image, by contrast, proxies `/api/*` and
`/healthz` through nginx and forwards other unknown paths to Go so 404s stay problem+json.

The usual workspace commands are also available from the repository root:

```sh
pnpm build        # nx run-many -t build
pnpm lint         # nx run-many -t lint
pnpm test         # nx run-many -t test
pnpm affected     # nx affected -t lint test build
pnpm graph        # Nx project graph
```

`go.work` is local-only and gitignored; do not commit it. CI verifies each Go module with
`GOWORK=off`.

## Architecture

Requests flow one way: the browser SPA calls `/api/*` on the same origin, nginx serves the SPA and
proxies `/api/*`, `/healthz` and unknown paths to Go on `127.0.0.1:8080`, and the HTTP adapter
calls the service, which applies one operation from the registry and returns a value or a typed
domain error.

Dependency direction inside the backend is inward: adapters depend on the domain and service, and
domain/service code imports no I/O, HTTP or framework packages. Interfaces are owned by the
consumer. The frontend keeps the calculator state machine pure and sends one canonical request per
evaluated result.

## API

`POST /api/v1/calculate` accepts one operation per request:

```json
{ "operation": "add", "operands": [1, 2] }
```

- `operation` is required and must be a registry name; unknown names return `UNKNOWN_OPERATION`.
- `operands` is a required array of JSON numbers. Wrong arity returns `INVALID_ARITY`; a non-number
  returns `INVALID_OPERAND_TYPE`.
- Unknown request fields are ignored. The body cap is 1 MiB. `NaN` and `Infinity` literals are
  rejected.
- `Content-Type: application/json` is required; a `charset` parameter is tolerated.

A success response is `200 application/json` with a shortest round-trip JSON number:

```json
{ "result": 3 }
```

`GET /healthz` returns `200 text/plain; charset=utf-8` with the body `ok\n`.

| Operation  | Arity  | Behavior                                                                                                                                    |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`      | binary | `a + b`                                                                                                                                     |
| `subtract` | binary | `a - b`                                                                                                                                     |
| `multiply` | binary | `a * b`                                                                                                                                     |
| `divide`   | binary | `a / b`; `DIVISION_BY_ZERO` when `b` is `0`                                                                                                 |
| `power`    | binary | `a ** b`; `COMPLEX_RESULT` for a negative base with a fractional exponent, `INDETERMINATE` for `0 ** 0`, `OVERFLOW` for a non-finite result |
| `sqrt`     | unary  | `√a`; `SQRT_OF_NEGATIVE` when `a < 0`                                                                                                       |
| `negate`   | unary  | `-a`                                                                                                                                        |
| `percent`  | unary  | `a / 100`; contextual percent is a frontend concern                                                                                         |

### Errors

Every error is RFC 9457 `application/problem+json` with a stable `code`, an optional `field` JSON
Pointer, a per-request `instance` UUID, and a `type` URI under
`https://calc.example/problems/<slug>`. A 400 means the request shape is wrong; a 422 means the
request was well formed but the math is semantically invalid.

```json
{
  "type": "https://calc.example/problems/invalid-operand-type",
  "title": "Invalid operand type",
  "status": 400,
  "detail": "operand must be a number",
  "instance": "c2f1b8a4-4f9e-4f6a-9f0e-6d5a1b2c3d4e",
  "code": "INVALID_OPERAND_TYPE",
  "field": "/operands/1"
}
```

| Status | `code`                   | When                                                                   |
| ------ | ------------------------ | ---------------------------------------------------------------------- |
| 400    | `INVALID_JSON`           | body unparseable, trailing data, or a `NaN`/`Infinity` literal         |
| 400    | `MISSING_FIELD`          | a required member is absent                                            |
| 400    | `UNKNOWN_OPERATION`      | the operation is not in the registry                                   |
| 400    | `INVALID_ARITY`          | the operand count is wrong                                             |
| 400    | `INVALID_OPERAND_TYPE`   | an operand is not a number                                             |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` is not `application/json`                               |
| 413    | `CONTENT_TOO_LARGE`      | the body is over 1 MiB                                                 |
| 422    | `DIVISION_BY_ZERO`       | `divide(x, 0)`                                                         |
| 422    | `SQRT_OF_NEGATIVE`       | `sqrt(x)` where `x < 0`                                                |
| 422    | `COMPLEX_RESULT`         | negative base with a fractional exponent                               |
| 422    | `INDETERMINATE`          | `power(0, 0)`                                                          |
| 422    | `OVERFLOW`               | the result is non-finite                                               |
| 422    | `INVALID_NUMBER`         | a non-finite operand, including a JSON number that overflows `float64` |
| 404    | `NOT_FOUND`              | no route matches the path                                              |
| 405    | `METHOD_NOT_ALLOWED`     | a non-POST method on the calculate path (`Allow: POST`)                |
| 500    | `INTERNAL_ERROR`         | an unhandled server fault                                              |

### Curl examples

Start with the container from the quick start (or the local backend on the same port), then:

```sh
api=http://localhost:8080/api/v1/calculate
```

Success and every error class reachable over HTTP:

```sh
# 200 success
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1,2]}'
# {"result":3}

# 400 INVALID_JSON — unparseable body
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' -d '{'

# 400 INVALID_JSON — trailing data
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1,2]} junk'

# 400 INVALID_JSON — NaN literal
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[NaN,1]}'

# 400 MISSING_FIELD
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add"}'

# 400 UNKNOWN_OPERATION
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"modulo","operands":[1,2]}'

# 400 INVALID_ARITY
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1]}'

# 400 INVALID_OPERAND_TYPE — field /operands/1
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1,"2"]}'

# 415 UNSUPPORTED_MEDIA_TYPE
curl -sS -i -X POST "$api" -H 'Content-Type: text/plain' \
  -d '{"operation":"add","operands":[1,2]}'

# 413 CONTENT_TOO_LARGE — over 1 MiB
head -c 1048577 /dev/zero | tr '\0' ' ' | \
  curl -sS -i -X POST "$api" -H 'Content-Type: application/json' --data-binary @-

# 422 DIVISION_BY_ZERO
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"divide","operands":[1,0]}'

# 422 SQRT_OF_NEGATIVE
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","operands":[-4]}'

# 422 COMPLEX_RESULT
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"power","operands":[-4,0.5]}'

# 422 INDETERMINATE
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"power","operands":[0,0]}'

# 422 OVERFLOW
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"multiply","operands":[1e308,1e308]}'

# 422 INVALID_NUMBER — a JSON number too large for float64
curl -sS -i -X POST "$api" -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1e400,1]}'

# 404 NOT_FOUND
curl -sS -i http://localhost:8080/nope

# 405 METHOD_NOT_ALLOWED — Allow: POST
curl -sS -i "$api"
```

The `1e400` operand above is valid JSON that overflows `float64` to infinity; the domain rejects
the non-finite value as `INVALID_NUMBER`. `INTERNAL_ERROR` needs fault injection, so it is covered
at the adapter level rather than by curl. Both appear in the API table above so every code is
documented.

## Testing and coverage

| Command                                                                  | What it runs                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm test`                                                              | Every Nx `test` target (Go tests + Vitest)                                          |
| `pnpm lint`                                                              | Every Nx `lint` target (`gofmt`/`go vet`, ESLint + jsx-a11y, Prettier)              |
| `pnpm build`                                                             | Every Nx `build` target (Go binary + Vite bundle)                                   |
| `cd apps/backend && GOWORK=off go test -race -shuffle=on -count=1 ./...` | Backend unit, integration, fuzz and property tests                                  |
| `pnpm --filter frontend run test:coverage`                               | Vitest + RTL with the 80% coverage thresholds                                       |
| `pnpm --filter frontend run test:e2e`                                    | Playwright transition rows and geometry, with the API mocked at the route level     |
| `pnpm --filter frontend run test:e2e:docker`                             | Docker smoke journeys against a running container (default `http://127.0.0.1:8080`) |
| `pnpm acceptance`                                                        | The agent-only pre-PR acceptance run (below)                                        |

Coverage gates: Go domain code (`domain.go` and `service.go`) is held to 90% lines, React `src/` to 80%
lines/branches/functions/statements. CI uploads a Go coverprofile and a frontend LCOV report to
Codecov under separate `backend` and `frontend` flags; patch coverage is required and overall
coverage is informational. The aggregate `CI` job is the required workflow check and always runs
when any job is skipped or fails; the Codecov patch status and critical flags are also required.

### Acceptance

`pnpm acceptance` is the repository-owned, agent-only gate run before a pull request. It is not a
CI job, and CI publishes no acceptance ledger — the Docker smoke and Playwright smoke above remain
CI's coverage of the built image.

The harness lives in `acceptance/`:

- `manifest.json` — strict manifest v2 with the ordered intent list (HTTP, the eight browser row
  groups, geometry and vision).
- `expectations.json` — the sidecar for what v2 cannot express: request counts and ordered calls,
  viewports, geometry relations, no-scroll, `aria-busy`, and route holds.
- `runbook.md` — the bootstrap-only runbook; one service, `-p 8080:80`.
- `reference/percent-worked.png` — the committed human reference for the vision intent.
- `run.mjs` and `lib/` — the runner and its schema/geometry helpers.
- `README.md` — the flags, ledger shape and failure workflow.

The runner builds the image through the `docker:build` target (`nx run docker:docker:build`), starts
it from the runbook, polls `/healthz`, executes every intent, tears the container down, and writes
the ledger under `$OPENCODE_SCRATCH_DIR/acceptance/<run-id>/` (falling back to
`<tmp>/opencode/acceptance/<run-id>/`, where `<tmp>` is `$TMPDIR` or `/tmp`). `run-id` is
`<short-sha>-<UTC>` unless `ACCEPTANCE_RUN_ID` is set:

```text
result.json              ledger v2 plus the additive requests/assertions fields
<intent>-before.png      screenshot before a browser intent's action
<intent>-after.png       screenshot after a browser intent's action
trace.zip                Playwright trace, written only on the first failure
```

`result.json` is ledger v2 — run metadata, `boot`, per-intent `results` and a `summary` — plus the
additive `results[].requests` (observed count and calls) and observed
`assertions.geometry`/`assertions.no_scroll` values. [`acceptance/README.md`](./acceptance/README.md)
lists every per-result field and runner flag.

Exit codes: `0` every intent passed or was deferred, `1` at least one intent failed, `2` a fatal
boot/health/browser/vision failure, `3` a configuration or schema error. The ledger is written even
after a fatal.

To read a failure:

1. Check the non-zero exit code, then open `result.json` and find the first result whose `verdict`
   is `fail` or `fatal`.
2. Read `error` for the failed assertion and `assertions.before`/`assertions.after` for what the
   browser observed.
3. Open the intent's `before`/`after` screenshots and, for the first failure, `trace.zip` with
   `pnpm --filter frontend exec playwright show-trace <path>`.
4. Compare `requests` with the sidecar expectation to confirm a request count or non-event.
5. A `deferred` result is a visual intent skipped by `--no-vision`; rerun without that flag.

The implementing agent files one labelled follow-up issue per failed or deferred intent; the runner
never touches the issue tracker. The surface, run story and ledger location are fixed by
[issue #24](https://github.com/luiznaac/calc/issues/24).

## Design decisions and assumptions

- **Nx + pnpm workspaces** — one cross-language task graph with `affected` selection and caching,
  with `go.work` kept local-only and CI using `GOWORK=off` ([issue #2](https://github.com/luiznaac/calc/issues/2)).
- **Flat hexagonal Go** — one bounded context, so `domain.go`, `service.go` and `adapters/` stay
  flat until a second context appears ([issue #3](https://github.com/luiznaac/calc/issues/3)).
- **React SPA** — Vite + React 19 + TypeScript strict + CSS Modules + `useReducer`, with no Next.js,
  Tailwind or Zustand for a single-screen calculator ([issue #4](https://github.com/luiznaac/calc/issues/4)).
- **nginx + Go in one image** — one same-origin URL for UI and API, no CORS and no direct API port,
  at the cost of roughly 70–80 MB versus a single Go binary ([issue #9](https://github.com/luiznaac/calc/issues/9)).
- **Contextual percent in the frontend** — `%` depends on the pending operation
  (`200 + 10%` sends `add(200, 20)`; `200 × 10%` sends `multiply(200, 0.1)`) while the API keeps
  unary `percent(x) = x / 100` ([issue #11](https://github.com/luiznaac/calc/issues/11)).
- **IEEE 754 `float64` and RFC 9457 errors** — shortest round-trip numbers, typed domain errors, a
  400-syntax/422-domain split and stable `code` values ([issue #5](https://github.com/luiznaac/calc/issues/5),
  [issue #6](https://github.com/luiznaac/calc/issues/6)).
- **Agent-only acceptance** — the real container is exercised pre-PR through nginx, the ledger stays
  in the scratch directory, and CI does not run the manifest ([issue #24](https://github.com/luiznaac/calc/issues/24)).
- **One root README** — no ADRs or committed OpenAPI artifact; TLS terminates upstream and auth,
  persistence, internationalization and cloud deployment stay out of scope
  ([issue #8](https://github.com/luiznaac/calc/issues/8), [issue #18](https://github.com/luiznaac/calc/issues/18)).

## Decision provenance

| Phase     | Question                         | What it produced                                                    | Ticket                                                                                                                                                                |
| --------- | -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charting  | What is the destination?         | The spec map and the locked decision set                            | [issue #1](https://github.com/luiznaac/calc/issues/1)                                                                                                                 |
| Research  | Monorepo, Go layout, React stack | Nx + pnpm + local `go.work`; flat hexagonal; Vite + React           | [issue #2](https://github.com/luiznaac/calc/issues/2), [issue #3](https://github.com/luiznaac/calc/issues/3), [issue #4](https://github.com/luiznaac/calc/issues/4)   |
| Grilling  | Domain, API, testing             | IEEE 754 operations, typed errors, RFC 9457, layered tests          | [issue #5](https://github.com/luiznaac/calc/issues/5), [issue #6](https://github.com/luiznaac/calc/issues/6), [issue #7](https://github.com/luiznaac/calc/issues/7)   |
| Grilling  | Docker, CI, documentation        | nginx + Go image, one required `CI` gate, this README               | [issue #9](https://github.com/luiznaac/calc/issues/9), [issue #10](https://github.com/luiznaac/calc/issues/10), [issue #8](https://github.com/luiznaac/calc/issues/8) |
| Grilling  | Percent and base interactions    | Contextual percent and the state × key transition table             | [issue #11](https://github.com/luiznaac/calc/issues/11), [issue #15](https://github.com/luiznaac/calc/issues/15)                                                      |
| Prototype | GUI shell and keypad             | Paper-ledger look, wireframe and the 20-relation geometry criterion | [issue #16](https://github.com/luiznaac/calc/issues/16)                                                                                                               |
| Grilling  | Acceptance surface               | Agent-only pre-PR harness with manifest v2, sidecar and ledger v2   | [issue #24](https://github.com/luiznaac/calc/issues/24)                                                                                                               |

## Repo layout

```text
.github/workflows/ci.yml      one CI workflow; the aggregate `CI` job is the required check
acceptance/                   manifest, expectations, runbook, reference image, runner
apps/backend/                 Go module in a flat hexagonal layout
apps/frontend/                React SPA, reducer, Vitest suites, Playwright journeys
docker/                       nginx config, proxy config, s6-overlay service definitions
docs/code-map.md              hand-authored index of modules and their seams
Dockerfile                    multi-stage SPA + Go + nginx runtime image
nx.json                       Nx task pipeline and cache defaults
package.json                  root scripts and workspace tooling
pnpm-workspace.yaml           workspace package list and build allow-list
```

The lane conventions live in [CODING_STANDARDS.md](./CODING_STANDARDS.md),
[apps/backend/CODING_STANDARDS.md](./apps/backend/CODING_STANDARDS.md) and
[apps/frontend/CODING_STANDARDS.md](./apps/frontend/CODING_STANDARDS.md).
