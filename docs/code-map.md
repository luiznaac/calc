# Code map

Index of the modules that matter and the seam a change crosses. Re-author it when the code moves;
it is hand-authored, never generated.

| Module         | Files                                                                                                                                                         | Seam                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace      | `package.json`, `pnpm-workspace.yaml`, `nx.json`                                                                                                               | Nx task graph and pnpm workspace; a new app is a `project.json` plus a workspace entry.                                                         |
| Backend app    | `apps/backend/project.json`, `apps/backend/go.mod`, `apps/backend/cmd/calculator/main.go`                                                                       | Go process entry point; the flat hexagonal domain, service, and adapters land under `apps/backend/internal/calculator` in #20.                   |
| Frontend app   | `apps/frontend/project.json`, `apps/frontend/src/main.tsx`, `apps/frontend/src/app/App.tsx`, `apps/frontend/vite.config.ts`, `apps/frontend/vitest.config.ts` | Browser entry point and test harness; the reducer, keypad, and feature modules land under `apps/frontend/src` in #21.                            |
| CI             | `.github/workflows/ci.yml`, `.codecov.yml`                                                                                                                    | The single required `CI` aggregate check; each job is a verification seam.                                                                      |
| Acceptance     | planned `acceptance/`                                                                                                                                         | No harness yet; the runbook, manifest, and ledger land in #22.                                                                                  |

## Entry points

- Backend process: `apps/backend/cmd/calculator/main.go`
- Frontend browser bundle: `apps/frontend/src/main.tsx` (served from `apps/frontend/index.html`)
- CI gate: the aggregate `CI` job in `.github/workflows/ci.yml`
