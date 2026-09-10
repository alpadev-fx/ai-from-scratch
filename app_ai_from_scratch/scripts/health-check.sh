#!/bin/sh
set -eu
base=${1:?usage: health-check.sh URL}
base=${base%/}
for path in /health /api/health /robots.txt; do
  code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$base$path" || true)
  echo "$path $code"
done
test "$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$base/robots.txt")" = 200
