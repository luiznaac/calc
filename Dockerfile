# syntax=docker/dockerfile:1

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS frontend

WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY tsconfig.base.json ./

RUN corepack pnpm install --frozen-lockfile --filter frontend...

COPY apps/frontend apps/frontend

RUN corepack pnpm --filter frontend run build


FROM golang:1.27-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS backend

WORKDIR /src

ENV CGO_ENABLED=0 \
    GOWORK=off

COPY apps/backend/go.mod apps/backend/go.sum ./

RUN go mod download

COPY apps/backend ./

RUN go build -trimpath -ldflags="-s -w" -o /out/calculator ./cmd/calculator


FROM nginx:alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606 AS runtime

ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.3.2

RUN set -eux; \
    apk add --no-cache --virtual .s6-build xz curl ca-certificates; \
    case "${TARGETARCH:-amd64}" in \
      amd64) s6arch=x86_64 ;; \
      arm64) s6arch=aarch64 ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}"; \
    curl -fsSL -o /tmp/s6-overlay-noarch.tar.xz "${base}/s6-overlay-noarch.tar.xz"; \
    curl -fsSL -o /tmp/s6-overlay-noarch.tar.xz.sha256 "${base}/s6-overlay-noarch.tar.xz.sha256"; \
    curl -fsSL -o "/tmp/s6-overlay-${s6arch}.tar.xz" "${base}/s6-overlay-${s6arch}.tar.xz"; \
    curl -fsSL -o "/tmp/s6-overlay-${s6arch}.tar.xz.sha256" "${base}/s6-overlay-${s6arch}.tar.xz.sha256"; \
    cd /tmp; \
    sha256sum -c s6-overlay-noarch.tar.xz.sha256 "s6-overlay-${s6arch}.tar.xz.sha256"; \
    tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz; \
    tar -C / -Jxpf "/tmp/s6-overlay-${s6arch}.tar.xz"; \
    rm -f /tmp/s6-overlay-*.tar.xz*; \
    apk del --no-network .s6-build

COPY --from=backend /out/calculator /usr/local/bin/calculator
COPY --from=frontend /repo/apps/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/proxy.conf /etc/nginx/proxy.conf
COPY docker/s6-rc.d /etc/s6-overlay/s6-rc.d
COPY docker/s6-user-bundle /etc/s6-overlay/user-bundles.d/user/contents.d

RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz || exit 1

STOPSIGNAL SIGTERM

ENTRYPOINT ["/init"]
