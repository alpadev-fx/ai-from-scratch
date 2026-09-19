#!/bin/sh
# Logical dump from a postgres URL. Goes through pg_dump, never through the app.
set -eu
url=${DATABASE_URL:-}
out=${1:-}
if [ -z "$url" ] || [ -z "$out" ]; then
  echo "usage: DATABASE_URL=postgres://... dump-url.sh <file>" >&2
  exit 1
fi

dump() {
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump -Fc "$url"
  else
    docker run --rm -e DATABASE_URL="$url" postgres:17-alpine \
      sh -c 'pg_dump -Fc "$DATABASE_URL"'
  fi
}

dump > "$out"
if [ ! -s "$out" ]; then
  echo "dump-url.sh: empty dump" >&2
  rm -f "$out"
  exit 1
fi
echo "dump-url ok $out"
