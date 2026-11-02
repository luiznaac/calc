# General and process coding standards

Cross-lane conventions the monorepo toolchain and CI do not enforce. Every rule cites its primary
source or the decision ticket that fixed it. Lane-specific language idioms live in each lane's doc:

- [Backend (Go & API/Data)](./apps/backend/CODING_STANDARDS.md)
- [Frontend (React/TS)](./apps/frontend/CODING_STANDARDS.md)

## Monorepo and Nx

- **Nx drives the task graph and cache.** Project names and folders stay aligned (`apps/frontend`,
  `apps/backend`, `libs/*`); new projects come from Nx generators. Source: [Monorepo tooling
  decision](https://github.com/luiznaac/calc/issues/2); [Nx docs](https://nx.dev).
- **Tag every project; enforce boundaries when the first shared `libs/*` package appears.** Every
  `project.json` carries `type:*` and `runtime:*` tags. The two-app skeleton has no shared library
  and no cross-boundary import to forbid, so `@nx/enforce-module-boundaries` with `depConstraints`
  arrives with that first library. Source: [Nx: enforce module
  boundaries](https://nx.dev/docs/features/enforce-module-boundaries); [Monorepo tooling
  decision](https://github.com/luiznaac/calc/issues/2).
- **Register each Go module as an Nx project** (or rely on `@nx-go/nx-go` inference) so affected
  selection and caching see Go tasks. Source: [Monorepo tooling
  decision](https://github.com/luiznaac/calc/issues/2); [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **CI runs `nx affected -t lint test build`**; required jobs never use path filters, because a
  skipped required job reports success. The aggregate `CI` job requires every job to succeed; a
  skipped job is not a pass. Source: [CI pipeline](https://github.com/luiznaac/calc/issues/10).

## pnpm workspaces and catalogs

- **List packages in `pnpm-workspace.yaml`**; internal dependencies use the `workspace:` protocol;
  shared versions are pinned through `catalog:`. Source: [pnpm
  workspaces](https://pnpm.io/workspaces); [pnpm catalogs](https://pnpm.io/catalogs); [Monorepo
  tooling decision](https://github.com/luiznaac/calc/issues/2).
- **Commit the lockfile**; CI installs with `--frozen-lockfile`. Source: [pnpm: continuous
  integration](https://pnpm.io/continuous-integration).
- **Treat lockfile changes as repo-wide**: they affect every task's cache key and are reviewed as
  such. Source: [Testing strategy](https://github.com/luiznaac/calc/issues/7); [CI
  pipeline](https://github.com/luiznaac/calc/issues/10).

## Go workspace

- **`go.work` is local-only and gitignored.** Never commit it; it overrides developer workspaces
  and can make CI test the wrong dependency versions. Source: [Go Modules Reference:
  workspaces](https://go.dev/ref/mod#workspaces); [Monorepo tooling
  decision](https://github.com/luiznaac/calc/issues/2).
- **CI verifies Go modules with `GOWORK=off`**; `go.mod`/`go.sum` remain authoritative per module.
  Source: [Go Modules Reference](https://go.dev/ref/mod); [CI
  pipeline](https://github.com/luiznaac/calc/issues/10).
- **Supported Go releases are 1.26 and 1.27**; the race detector runs on 1.27 only. Source: [CI
  pipeline](https://github.com/luiznaac/calc/issues/10).

## Git and PR conventions

- **Never commit to `master`.** Work on a feature branch and open a pull request. Source: [CI
  pipeline](https://github.com/luiznaac/calc/issues/10); [GitHub docs: about protected
  branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- **Short, imperative commit messages.** No attribution lines and no AI-generated-with or
  co-author trailers; the same rule applies to PR descriptions. Source: workspace agent
  conventions (global `AGENTS.md`).
- **One PR per coherent piece of work.** Do not bundle unrelated changes. Source: workspace agent
  conventions (global `AGENTS.md`).
- **Required checks on `master`**: the aggregate `CI` job plus the Codecov patch status and
  critical-package flags. Configure branch protection after the first fully green run so the check
  names exist. Source: [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **Issue and PR bodies/reads go through the GitHub MCP server**; `gh api` only for what MCP does
  not expose (native dependencies, sub-issue listing); merge, CI status, and PR creation stay on
  `gh`. Source: [Repo AGENTS.md](./AGENTS.md).
- **Commits run the repo's own tests and the branch guard.** The committed
  `.pre-commit-config.yaml` carries the pinned `no-commit-to-branch` hook plus `test-backend` and
  `test-frontend` local hooks. Source: workspace agent conventions (global `AGENTS.md`).

## CI caching and Codecov gates

- **GitHub Actions caches only**; explicit `key`/`restore-keys`; never cache secrets. Source:
  [GitHub Actions
  caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows);
  [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **Cache the Go module and build caches, the pnpm store, `.nx/cache`, and Docker `type=gha`.**
  Caches are branch-scoped; pull requests read base-branch caches. Source: [CI
  pipeline](https://github.com/luiznaac/calc/issues/10).
- **Codecov uses separate `backend` and `frontend` flags**; patch status is required, overall
  coverage is informational, and critical flags cover Go domain 90% and React `src/` 80%;
  `after_n_builds` equals the upload count. Source: [Codecov
  YAML](https://docs.codecov.com/docs/codecov-yaml); [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **Security gates**: `govulncheck`, `pnpm audit --audit-level high`, pinned `golangci-lint`,
  ESLint, and Prettier `--check`; low/info advisories stay non-blocking. Source: [CI
  pipeline](https://github.com/luiznaac/calc/issues/10).

## Docker multi-stage rules

- **One root multi-stage Dockerfile**, named stages (`AS`), `COPY --from=`, digest-pinned bases
  (`@sha256:...`), and a `HEALTHCHECK`. Source: [Docker multi-stage
  builds](https://docs.docker.com/build/building/multi-stage/); [Docker packaging
  decision](https://github.com/luiznaac/calc/issues/9).
- **Single nginx + Go image with s6-overlay**: Go starts before nginx; both handle `SIGTERM`; nginx
  proxies `/api/*` and `/healthz` to Go on `127.0.0.1:8080`; the image exposes only nginx port 80.
  Source: [Docker packaging decision](https://github.com/luiznaac/calc/issues/9).
- **Builders**: `node:22-alpine` for React, `golang:1.27-alpine` with `CGO_ENABLED=0` for Go, and
  `nginx:alpine` plus s6-overlay; all bases digest-pinned. Source: [Docker packaging
  decision](https://github.com/luiznaac/calc/issues/9); [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **Build through the Nx target `docker:build`**; the Docker smoke job runs the container and polls
  `/healthz` through nginx. Source: [Docker packaging
  decision](https://github.com/luiznaac/calc/issues/9); [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **TLS terminates upstream.** The container does not handle TLS. Source: [Docker packaging
  decision](https://github.com/luiznaac/calc/issues/9).

## Documentation and code map

- **One root `README.md`, quickstart-first.** It lands with the README ticket. No ADRs and no
  committed OpenAPI artifact. Source: [Documentation requirements](https://github.com/luiznaac/calc/issues/8);
  [README ticket](https://github.com/luiznaac/calc/issues/23).
- **The code map is hand-authored, not generated.** Keep `docs/code-map.md` and the root
  `## Code map` index current as the code moves. Source: workspace agent conventions (global
  `AGENTS.md`).
- **No external project links.** Do not link to another project's repository or tracker; links to
  this repository's issues and to primary sources (framework docs and specifications) are expected.
  Source: [Foundation ticket](https://github.com/luiznaac/calc/issues/19).

## References

- [Monorepo tooling decision](https://github.com/luiznaac/calc/issues/2)
- [Testing strategy](https://github.com/luiznaac/calc/issues/7)
- [Documentation requirements](https://github.com/luiznaac/calc/issues/8)
- [Docker packaging decision](https://github.com/luiznaac/calc/issues/9)
- [CI pipeline](https://github.com/luiznaac/calc/issues/10)
- Primary sources: [Nx](https://nx.dev), [pnpm](https://pnpm.io), [Go Modules
  Reference](https://go.dev/ref/mod), [GitHub Actions
  caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows),
  [Codecov YAML](https://docs.codecov.com/docs/codecov-yaml), [Docker multi-stage
  builds](https://docs.docker.com/build/building/multi-stage/).
