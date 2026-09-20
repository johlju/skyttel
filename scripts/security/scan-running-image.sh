#!/usr/bin/env bash
set -euo pipefail

image=$1
reports=$2
container="skyttel-zap-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
mkdir -p "$reports"
reports=$(realpath "$reports")
trap 'docker rm --force "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" -p 127.0.0.1:3000:3000 \
  --tmpfs /data:uid=1000,gid=1000 \
  -e SKYTTEL_ORIGIN=http://localhost:3000 \
  -e SKYTTEL_FIRST_ADMIN_PROVIDER=google \
  -e SKYTTEL_FIRST_ADMIN_SUBJECT=synthetic-admin \
  -e BETTER_AUTH_SECRET=synthetic-ci-secret-at-least-32-characters \
  -e GOOGLE_CLIENT_ID=synthetic -e GOOGLE_CLIENT_SECRET=synthetic \
  -e MICROSOFT_CLIENT_ID=synthetic -e MICROSOFT_CLIENT_SECRET=synthetic \
  "$image"
curl --fail --retry 20 --retry-connrefused --retry-all-errors --retry-delay 1 \
  --connect-timeout 2 --max-time 2 --retry-max-time 30 http://localhost:3000/healthz
curl --fail http://localhost:3000/ > "$reports/index.html"
chmod 777 "$reports"
status=0
docker run --rm --network host -v "$reports:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:2.17.0@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef \
  zap-baseline.py -t http://localhost:3000 -J zap.json -r zap.html -m 1 || status=$?
# Exit 2 contains warnings that still require the report's High-risk policy.
if [ "$status" -ne 0 ] && [ "$status" -ne 2 ]; then exit "$status"; fi
node scripts/security/check-results.mjs zap "$reports/zap.json"
