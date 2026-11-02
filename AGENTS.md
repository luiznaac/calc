# Agent notes

## Code map

- [Code map](./docs/code-map.md)

## Coding standards

- [General and process](./CODING_STANDARDS.md)
- [Backend (Go & API/Data)](./apps/backend/CODING_STANDARDS.md)
- [Frontend (React/TS)](./apps/frontend/CODING_STANDARDS.md)

## Acceptance

- **Surface kinds**: HTTP (health, success, every API error class except `INVALID_NUMBER` and
  `INTERNAL_ERROR`, and the non-events through nginx), Browser (the SPA, the eight transition
  rows, the 20 keypad geometry relations at five viewports, and the vision intents), and the
  container/runtime surface (single nginx port 80, `/healthz` and `/api/*` reached through
  nginx, no direct API port).
- **Run story**: `pnpm acceptance` builds the image, boots it through
  [`acceptance/runbook.md`](./acceptance/runbook.md), runs
  [`acceptance/manifest.json`](./acceptance/manifest.json) with
  [`acceptance/expectations.json`](./acceptance/expectations.json), and writes the ledger,
  screenshots and trace under `$OPENCODE_SCRATCH_DIR/acceptance/<run-id>/`.
- **Runbook**: [acceptance/runbook.md](./acceptance/runbook.md) — bootstrap-only, one service;
  the image exposes only nginx on port 80.
- Acceptance is agent-only and pre-PR. CI never runs the manifest and never publishes a ledger
  artifact. Details: [acceptance/README.md](./acceptance/README.md).
