#!/bin/sh
# Restore a dump into a throwaway postgres container. Never the live DB.
set -eu
dump=${1:-}
integrity=${2:-}
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "usage: restore.sh <dump> [integrity.sql]" >&2
  exit 1
fi
if [ -n "$integrity" ] && [ ! -f "$integrity" ]; then
  echo "restore.sh: integrity file missing: $integrity" >&2
  exit 1
fi

cid=$(docker run -d --rm -e POSTGRES_PASSWORD=restore postgres:17-alpine)
trap 'docker stop "$cid" >/dev/null 2>&1 || true' EXIT

# pg_isready can succeed during init, then the server restarts and the
# socket vanishes. Accept ready only when a real query returns.
i=0
ready=0
while [ "$i" -lt 30 ]; do
  if docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1 \
    && docker exec "$cid" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "restore.sh: postgres never became ready" >&2
  exit 1
fi

docker exec -i "$cid" pg_restore --exit-on-error --no-owner --no-acl -U postgres -d postgres < "$dump"
echo "restore ok"

if [ -n "$integrity" ]; then
  docker exec -i "$cid" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$integrity"
  echo "integrity ok"
fi
