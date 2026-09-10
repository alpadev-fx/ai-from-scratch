# Disaster recovery

Target RPO is 1 hour and RTO is 4 hours. Railway Postgres daily, weekly and
monthly backup schedules were enabled for all three DEV databases on
2026-09-09. The same schedules are a mandatory PROD release gate; they do not
exist in PROD while that environment remains unprovisioned. `scripts/backup.sh`
creates logical dumps for course, payments and messages; upload encrypted dumps
to the environment backup bucket with checksums and retention.

Run `sh scripts/restore.sh <dump>` only against a disposable Postgres instance,
then apply migrations and `pnpm verify`. Record duration and recoverable time.
For API failure, redeploy the last successful image. For a bad migration, stop
writers and restore into a new database service before switching variables.
Redis cache is disposable. RabbitMQ uses a persistent volume; after broker loss,
restore service availability, replay durable source events and redrive the DLQ.
AI and Resend outages degrade optional features and retry. Payment webhooks stay
persisted and are reconciled before granting access. Bucket loss uses the
external dump copy; rotate credentials afterward.

The DEV schedules are confirmed by Railway's API, but a destructive restore has
not been run. Backups are therefore scheduled, not yet restore-verified. Never
run the restore drill against PROD.
