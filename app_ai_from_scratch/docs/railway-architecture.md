# Railway architecture

The platform is a Docker Compose monorepo with Astro web, Fastify API/auth,
Go data and queue services, Python FastAPI AI, separate payments and messages
services, RabbitMQ, three PostgreSQL databases, and host-bound security agents.
The API reaches course data through a closed Go catalogue; payments and messages
have independent persistence. Sessions, progress and entitlements are durable;
the agent bus and auth brakes still contain process-local state.

The graph is `Postgres -> init -> data/AI/payments/messages -> API -> web`;
RabbitMQ feeds API/AI workers and defense consumers. Web is the browser boundary;
payment webhooks are the external inbound integration.

Implemented: healthchecks, graceful shutdown, signed/idempotent payment events,
RabbitMQ retries/DLQ, `SKIP LOCKED`, bounded pools, ontology isolation proof,
Resend mail abstraction, and fail-closed auth/payment secrets.

Partial: rate limiting and agent memo are per-process; backups are host scripts;
observability is logs and endpoint health; CI deploys by SSH.

Missing: Railway state, DEV/PROD isolation, external logical backup storage,
measured load capacity, continuous monitoring, and a tested Railway cutover.

Risky: direct production deploy workflow, local filesystem PDF serving, three
independent DBs without verified off-host restore, and host-network defense
containers. No Redis or object-storage integration exists in application code.

Target: one Railway project with only `DEV` and `PROD`; each has isolated course,
payments and messages PostgreSQL, Redis, RabbitMQ, private API/data/AI/workers,
and one bucket. Web and signed webhook endpoints are public. Begin at one
replica, then scale from measurements. Focused PR environments inherit DEV and
are ephemeral with synthetic credentials.

Migration: build immutable images, create DEV, restore a sanitized dump, run
migrations/E2E/smoke/load checks, then use a 60-minute maintenance window to
stop writes, copy and verify data, switch DNS, reconcile webhooks, and retain
the old host read-only. Roll back to the last known-good Railway deployment;
never point an older binary at a newer destructive schema.
