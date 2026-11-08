#!/usr/bin/env bash
# Smoke test for the frontend image: boots it, waits for the Docker HEALTHCHECK, then asserts the
# SPA is served and every security header is present on the HTML document AND on a hashed asset.
# The header check is the regression guard for the nginx add_header inheritance bug (headers set
# at server level were silently dropped by locations that declare their own add_header).
set -euo pipefail

image_tag="${IMAGE_TAG:?IMAGE_TAG is required}"
container="frontend-smoke-$$"
port=18080

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" -p "${port}:8080" "$image_tag" >/dev/null

for _ in $(seq 1 30); do
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container")"
  [ "$status" = "healthy" ] && break
  [ "$status" = "unhealthy" ] && { echo "Container became unhealthy" >&2; docker logs "$container" >&2; exit 1; }
  sleep 2
done
[ "$status" = "healthy" ] || { echo "Container did not become healthy (status=$status)" >&2; exit 1; }

fail=0
check_headers() {
  local url="$1" headers
  headers="$(curl -fsSI "$url")"
  for h in Content-Security-Policy X-Frame-Options X-Content-Type-Options Referrer-Policy Permissions-Policy; do
    if ! grep -qi "^${h}:" <<<"$headers"; then
      echo "MISSING ${h} on ${url}" >&2
      fail=1
    fi
  done
  if grep -qiE '^Server: nginx/[0-9]' <<<"$headers"; then
    echo "nginx version leaked on ${url}" >&2
    fail=1
  fi
}

base="http://localhost:${port}"
# A deep link must fall back to index.html (SPA history mode).
check_headers "${base}/afiliados"
asset="$(curl -fsS "${base}/" | grep -oE 'main-[A-Za-z0-9]+\.js' | head -1)"
[ -n "$asset" ] || { echo "Could not find the main bundle in index.html" >&2; exit 1; }
check_headers "${base}/${asset}"

[ "$fail" -eq 0 ] || exit 1
echo "Frontend smoke test passed: SPA served, security headers present on HTML and assets."
