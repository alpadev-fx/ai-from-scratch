# Disaster recovery

Minimum viable recovery for launch. Not enterprise DR.

Checked 2026-09-19 against Railway project `ai-from-scratch`
(`4015473a-e3f1-4bad-b2c0-6969428c2d65`). Every number below was read from
the API or from a command run that day.

## What is backed up

Production is three Postgres services: `course-db` (accounts, progress,
entitlements), `payments-db` (Mercado Pago webhooks and grants),
`messages-db` (chat log). Redis is disposable. RabbitMQ has a volume; after
broker loss, restore availability, replay durable source events and redrive
the DLQ.

The production backup mechanism is **Railway volume snapshots**, independent
of the API, web, and workers. Listing and locking them uses the Railway CLI
or the dashboard. It does not go through `aifromscratch.shop`.

```sh
railway postgres pitr backup list \
  --project 4015473a-e3f1-4bad-b2c0-6969428c2d65 \
  --environment Production \
  --service course-db --json
```

Point-in-time recovery is **off** on all six databases (DEV and Production).
`enabled: false`, `bucketWired: false`. Daily snapshots are the launch
baseline; PITR is a follow-up if the 24-hour data-loss window becomes too
wide.

## Schedule and retention

Automated snapshots are enabled on all three Production databases and all
three Devevelopment databases. Confirmed 2026-09-19: Production `course-db`
had a daily snapshot from 2026-09-18, `payments-db` a weekly from
2026-09-19, `messages-db` a daily from 2026-09-19.

| Kind | Retention | Seconds |
|---|---|---|
| Daily | 6 days | 518400 |
| Weekly | 27 days | 2332800 |
| Monthly | 89 days | 7689600 |

## Launch-baseline locks

These Production snapshots are locked so retention cannot expire them:

| Service | Backup id | Taken | Kind |
|---|---|---|---|
| course-db | `71cff90b-4206-4df0-9868-9bbb82bbbe40` | 2026-09-18T08:26:04Z | Daily |
| payments-db | `0e6be9d8-b614-4dc9-9152-171c47807292` | 2026-09-19T05:19:01Z | Weekly |
| messages-db | `34f0e238-d31b-44f5-91b9-a8e8ec9bf35f` | 2026-09-19T00:06:05Z | Daily |

## Data-loss window and recovery time

| | Value | Why |
|---|---|---|
| Expected data-loss window (RPO) | **up to 24 hours** | Daily snapshots. The three Production crons are not aligned; the worst gap between two dailies on one database is one day. |
| Approximate recovery time (RTO) | **under 1 hour** for the current ~1 GB volumes | Throwaway logical restore of the fixture dump was 3 seconds on a laptop. A Production volume snapshot restore plus variable switch is the slow path: create or pick a target, restore, check integrity, point `DATABASE_URL`. Budget an hour. |

An earlier draft of this file said RPO 1 hour. That would need PITR. It was
wrong for the mechanism that is actually running.

## Recovery owner

Alejandro Padrón (`alpadev-fx`), Railway workspace owner on
`alexein fx's Projects`. The CLI and dashboard are the access path; the
production application is not.

## Restore, never in place on Production

`railway postgres pitr backup restore <id> --service <db>` **overwrites that
service**. Do not run it against Production.

Safe order:

1. Dump or snapshot access does not go through the API.
2. Restore into a throwaway Postgres (local Docker, or a new Railway
   Postgres service that is not serving traffic).
3. Check integrity: `users` and `entitlement_events` exist; counts are
   sane; a known account still has `paid = 1` if it should.
4. Only then switch application variables. Never restore onto the live
   volume as the first move.

### Logical dump (host or Railway URL)

```sh
# Host compose (Pi / docker-compose.prod.yml)
sh scripts/backup.sh

# Directly from a postgres URL. Does not use the app.
DATABASE_URL='postgres://…' sh scripts/dump-url.sh /tmp/course.dump

# Throwaway restore + integrity
sh scripts/restore.sh /tmp/course.dump scripts/backup-integrity-live.sql
```

`scripts/restore.sh` starts its own container and deletes it when it
exits. It refuses a missing dump. It never calls `docker compose`.

### Railway snapshot onto a new service

Create a new Postgres service in **Devevelopment** or a scratch
environment. Restore the snapshot onto **that** service, not Production.
Validate, then point a scratch API at it. Cut Production over only after
the scratch API can log in a known paid account.

### After a bad migration

Stop writers. Restore into a new database service. Apply the last known-good
schema if the dump is older than the code. Switch variables. Redeploy the
last successful image if the API is the failure, not the data.

## Restore drill (2026-09-19)

Logical dumps taken over Railway SSH (the database container, not the API),
restored into throwaway local Postgres, dumps deleted afterwards. Counts
only:

| Source | Dump size | Restore | Integrity |
|---|---|---|---|
| Production `course-db` | 76 726 bytes | 2 s | 6 users, 3 entitlement events, 2 paid |
| Production `payments-db` | 22 845 bytes | 1 s | 1 payment, 1 entitlement delivery |
| Devevelopment `course-db` | 71 KiB | 2 s | 2 users, 0 grants |
| Fixture (`pnpm verify` / CI) | tiny | 3 s | canary account + grant |

```sh
railway ssh -p 4015473a-e3f1-4bad-b2c0-6969428c2d65 \
  -e Production -s course-db -- \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > /tmp/course.dump
sh scripts/restore.sh /tmp/course.dump scripts/backup-integrity-live.sql
rm -f /tmp/course.dump
```

## What the gate proves

`pnpm verify` runs `scripts/backup-restore.test.mjs`, which:

- fails closed if `restore.sh` is called without a dump
- fails closed if a dump has `users` / `entitlement_events` but not the
  canary account
- dumps a fixture with `canary@restore.test` + a live grant, restores it
  into throwaway Postgres, and checks both rows survived

That drill does not touch compose, DEV, or Production. CI job
`backup-restore` runs the same tests.

A live compose dump is opt-in: `BACKUP_DRILL=live sh scripts/backup-drill.sh`.

## Out of scope for launch

- PITR / 1-hour RPO
- Encrypted dump copies in the environment bucket
- Cross-region replica
- Restoring RabbitMQ or Redis
