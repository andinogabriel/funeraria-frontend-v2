# =============================================================================
# Multi-stage build for funeraria-frontend-v2.
#
# Stage 1 (builder): pulls the Node toolchain pinned by .nvmrc, installs deps
# (with the --legacy-peer-deps flag documented in CLAUDE.md — npm 10 + Angular
# 20 + Tailwind 4 surface peer-range mismatches without it) and produces the
# production bundle under /app/dist.
#
# Stage 2 (runtime): copies only the built bundle into a tiny nginx:alpine
# image. nginx serves the SPA with history-mode fallback (every unknown path
# returns /index.html so the Angular Router takes over) and proxies /api and
# /actuator to the backend. The runtime image carries no Node, no source, no
# node_modules — the final layer weighs ~25 MB and starts in < 1 s.
#
# Build:        docker build -t funeraria-frontend-v2:local .
# Run alone:    docker run --rm -p 4200:80 funeraria-frontend-v2:local
# Run + stack:  docker compose up --build
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — builder
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency descriptors first so the layer cache holds the npm install
# step as long as the lockfile does not change. Changing application source
# does not invalidate node_modules.
COPY package.json package-lock.json ./

# `npm ci` (not `npm install`) so the lockfile is the source of truth and the
# build is reproducible. `--legacy-peer-deps` is documented in CLAUDE.md as
# the workaround for Angular 20 + Tailwind 4 peer-range mismatches that
# resolve without it.
RUN npm ci --legacy-peer-deps

# Copy the rest of the source. The .dockerignore keeps node_modules, dist,
# .git and the Angular CLI cache out of the build context.
COPY . .

# Production build through the same script CI uses. esbuild emits hashed
# assets under /app/dist/funeraria-frontend-v2/browser; the .conf below
# expects that path.
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2 — runtime (nginx)
# -----------------------------------------------------------------------------
FROM nginx:alpine AS runtime

# nginx.conf carries the SPA history fallback + the /api and /actuator reverse
# proxy targets (resolved through the `backend` service name when composed,
# overridable via env).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The Angular CLI nests the browser bundle under /<project>/browser when the
# `outputMode` defaults are in effect. Copy only that directory so the image
# never carries server-side artefacts.
COPY --from=builder /app/dist/funeraria-frontend-v2/browser /usr/share/nginx/html

# Default nginx port; docker-compose binds it to host 4200 to match the dev
# `ng serve` port.
EXPOSE 80

# nginx runs in the foreground in the official image; no CMD override needed.
