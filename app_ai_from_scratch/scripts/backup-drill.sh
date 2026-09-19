#!/bin/sh
# Fixture dump → throwaway restore → account/entitlement integrity.
# Never the live compose databases. BACKUP_DRILL=live also dumps those,
# still into a directory, never back into themselves.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if ! command -v docker >/dev/null 2>&1; then
  echo "backup-restore: docker is required" >&2
  exit 1
fi
if [ ! -f "$ROOT/docker-compose.yml" ]; then
  echo "backup-restore: docker-compose.yml missing" >&2
  exit 1
fi
if [ ! -f "$ROOT/scripts/backup-fixture.sql" ] || [ ! -f "$ROOT/scripts/backup-integrity.sql" ]; then
  echo "backup-restore: fixture or integrity sql missing" >&2
  exit 1
fi

WORKDIR=$(mktemp -d)
src=
cleanup() {
  [ -n "$src" ] && docker stop "$src" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

src=$(docker run -d --rm -e POSTGRES_PASSWORD=drill postgres:17-alpine)
i=0
ready=0
while [ "$i" -lt 30 ]; do
  if docker exec "$src" pg_isready -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "backup-drill: source postgres never became ready" >&2
  exit 1
fi

docker exec -i "$src" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$ROOT/scripts/backup-fixture.sql"
docker exec "$src" pg_dump -Fc -U postgres postgres > "$WORKDIR/curso.dump"
echo "fixture canary@restore.test"

sh "$ROOT/scripts/restore.sh" "$WORKDIR/curso.dump" "$ROOT/scripts/backup-integrity.sql"

if [ "${BACKUP_DRILL:-}" = "live" ]; then
  DEPLOY_PATH="$ROOT" BACKUP_DIR="${TMPDIR:-/tmp}/aifs-backup-drill" sh "$ROOT/scripts/backup.sh"
fi
