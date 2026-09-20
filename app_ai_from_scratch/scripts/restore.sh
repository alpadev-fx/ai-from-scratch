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

# Wait over TCP, not over the unix socket, and this is the whole point of the
# loop. The postgres image boots twice: the entrypoint runs a temporary server
# for initdb, stops it, then execs the real one. The temporary server answers
# on the socket, so pg_isready AND a real 'select 1' both succeed against it --
# and then the socket vanishes for a second or two while the real server comes
# up, and every command after the wait dies with
#   psql: error: connection to server on socket ... failed: No such file or directory
# The temporary server is started with listen_addresses='' (see the upstream
# docker-entrypoint.sh), so it can never answer over TCP. That makes a TCP
# connection proof of the real server rather than a guess about timing: this
# loop cannot report ready early no matter how slow the host is.
i=0
ready=0
while [ "$i" -lt 30 ]; do
  if docker exec -e PGPASSWORD=restore "$cid" \
    psql -h 127.0.0.1 -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
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

docker exec -i -e PGPASSWORD=restore "$cid" pg_restore --exit-on-error --no-owner --no-acl -h 127.0.0.1 -U postgres -d postgres < "$dump"
echo "restore ok"

if [ -n "$integrity" ]; then
  docker exec -i -e PGPASSWORD=restore "$cid" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres < "$integrity"
  echo "integrity ok"
fi
