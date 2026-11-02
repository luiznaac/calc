# Agent notes

## Code map

- [Code map](./docs/code-map.md)

## Coding standards

- [General and process](./CODING_STANDARDS.md)
- [Backend (Go & API/Data)](./apps/backend/CODING_STANDARDS.md)
- [Frontend (React/TS)](./apps/frontend/CODING_STANDARDS.md)

## Acceptance

No self-served acceptance run or runbook exists yet. Acceptance gating starts with
[Docker packaging and Docker smoke](https://github.com/luiznaac/calc/issues/22); the foundation is
verified by the CI workflow. Do not add an acceptance manifest, job, or ledger artifact before #22.
