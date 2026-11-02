# Acceptance runbook

Bootstrap-only, one service: the calculator image. The image exposes only nginx on port 80;
Go listens on `127.0.0.1:8080` inside the container and no direct API port is published. The
runner never changes source and never boots a browser from this runbook.

|       |                                                                    |
| ----- | ------------------------------------------------------------------ |
| start | `docker run --rm -d --name calc-acceptance -p 8080:80 calc:acceptance` |
| ready | `curl -fsS http://localhost:8080/healthz`                          |
| port  | `8080`                                                             |
| stop  | `docker stop calc-acceptance`                                      |
| build | `corepack pnpm exec nx run docker:docker:build`                          |
| cwd   | `.`                                                                |

Port 8080 is the host mapping for nginx, which serves the SPA and proxies `/api/*` and
`/healthz` to Go. The same-origin path is proved by `http-success`; there is no separate API
port to test.
