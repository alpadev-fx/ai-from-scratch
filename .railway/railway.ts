import { bucket, defineRailway, github, group, image, postgres, project, redis, service, volume } from "railway/iac";

// Desired state for the whole platform. No secret VALUES live here: a secret is
// either `preserveExisting` on the service that owns it, or a reference to that
// owner. That distinction is the point — Railway IaC DELETES any variable this
// file does not declare, so an undeclared secret is a silently removed secret.
export default defineRailway((ctx) => {
  const prod = ctx.isEnvironment("PROD") || ctx.isEnvironment("production");

  // ---------- data stores ----------
  const db = postgres("course-db");
  const paymentsDb = postgres("payments-db");
  const messagesDb = postgres("messages-db");
  // `redis` is reserved by an orphaned template service in the Railway
  // project; use a project-unique name while retaining the Redis role.
  const cache = redis("cache");
  const files = bucket(prod ? "prod-files" : "dev-files", { region: "iad" });

  // ---------- source ----------
  // PROD tracks `main`. It must NEVER track a feature branch: every push to a
  // WIP branch would auto-deploy to paying users.
  const repo = github("Alxn44/ai-from-scratch", { branch: prod ? "main" : "mvp-readiness/2026-09" });
  const common = { source: repo, replicas: 1 };
  const node = { builder: "DOCKERFILE" as const, dockerfilePath: "Dockerfile", watchPatterns: ["**"] };
  const apiBuild = { builder: "DOCKERFILE" as const, dockerfilePath: "api/Dockerfile", watchPatterns: ["api/**", "auth/**", "package.json", "pnpm-lock.yaml"] };
  // Railway injects PORT=8080. Internal DNS entries are hostnames only, so
  // consumers must include the scheme and port explicitly.
  const INTERNAL = (name: string) => `http://${name}.railway.internal:8080`;
  const preserve = { preserveExisting: true } as const;

  // ---------- message bus ----------
  // The broker owns AMQP_URL as a single value; every consumer references it:
  //   railway variable set AMQP_URL='amqp://app:<pass>@rabbitmq.railway.internal:5672/' --service rabbitmq
  // A volume is not optional. Without it a broker restart drops every queued
  // message, so a paid webhook can vanish before enrolment.
  const brokerData = volume("rabbitmq-data", { sizeMB: 1024, region: "iad" });
  const broker = service("rabbitmq", {
    source: image("rabbitmq:4-management-alpine"),
    replicas: 1,
    volumeMounts: { "/var/lib/rabbitmq": brokerData },
    deploy: { restartPolicyType: "ALWAYS" },
    env: {
      RABBITMQ_DEFAULT_USER: "app",
      RABBITMQ_DEFAULT_PASS: preserve,
      AMQP_URL: preserve,
    },
  });

  // ---------- secret owners (declared before `api`, which references them) ----------
  const data = service("data", {
    ...common,
    root: "app_ai_from_scratch",
    build: { builder: "DOCKERFILE", dockerfilePath: "data/Dockerfile", watchPatterns: ["data/**", "api/src/ontologia.json"] },
    healthcheck: "/health",
    env: { DATABASE_URL: db.env.DATABASE_URL, DATA_SECRETO: preserve },
  });

  const ai = service("ai", {
    ...common,
    root: "app_ai_from_scratch/ai",
    build: node,
    start: "sh -c '.venv/bin/uvicorn course_ai.app:app --host 0.0.0.0 --port ${PORT:-8799}'",
    healthcheck: "/salud",
    // No sleepApplication. It was set here to save DEV compute, but every route
    // that reaches this service sits behind requireUser (api/src/server.ts:794)
    // and DEV has no seeded user, so whether a private-network call from `api`
    // wakes a sleeping container could not be tested. An unverified sleep makes
    // the AI path fail intermittently in the environment that is supposed to be
    // the staging gate. Restore it only after proving the wake path.
    env: {
      NODE_URL: INTERNAL("api"),
      IA_SECRETO: preserve,
      // Without a provider key the tutor answers 501 `sin_proveedor`
      // (ai/src/course_ai/agent/loop.py:115). providers.py:154 activates a
      // provider only when its key is non-empty, and every *_MODEL has a
      // default, so the key alone is enough. ANTHROPIC_API_KEY is the one that
      // matters: it powers BOTH lanes — `anthropic` (Haiku, flash) and
      // `sonnet` (reasoning) — from a single credential (providers.py:122-136).
      // OPENROUTER_API_KEY is the cheap fallback. Empty stays inert.
      ANTHROPIC_API_KEY: preserve,
      // Declared so an apply does not DELETE them: Railway IaC removes every
      // variable this file omits. These were set out of band and each lands in
      // its correct slot — Moonshot at providers.py:129-131, DeepSeek at :127.
      KIMI_API_KEY: preserve,
      DEEPSEEK_API_KEY: preserve,
      // Deliberately kept empty. The OPENROUTER_* pair in the workspace .env is
      // NOT OpenRouter: the key is the Moonshot/Kimi one and the base URL is
      // https://api.moonshot.ai/v1. providers.py:139-140 would build a request
      // to that host with no /chat/completions path and model `openrouter/auto`
      // — a 404 on every call. An empty key deactivates the row (providers.py:154).
      // Fill it only with a real sk-or- OpenRouter key and no base-URL override.
      OPENROUTER_API_KEY: preserve,
      OPENROUTER_BASE_URL: preserve,
    },
  });

  const messages = service("messages", {
    ...common,
    root: "app_ai_from_scratch/messages",
    build: node,
    healthcheck: "/health",
    env: { DATABASE_URL: messagesDb.env.DATABASE_URL, MESSAGES_SECRET: preserve },
  });

  const payments = service("payments", {
    ...common,
    root: "app_ai_from_scratch/payments",
    build: node,
    healthcheck: "/health",
    // MercadoPago posts webhooks from the internet: this service needs a
    // reachable origin or the money path cannot complete.
    domains: prod ? ["pagos.aifromscratch.shop"] : [],
    env: {
      DATABASE_URL: paymentsDb.env.DATABASE_URL,
      ENTITLEMENTS_URL: INTERNAL("api"),
      // api sends `authorization: Bearer $PAYMENTS_SECRET` (api/src/server.ts:983)
      // and payments verifies it as `serviceSecret` (payments/src/config.ts:87).
      // One value, owned here, referenced by api.
      PAYMENTS_SECRET: preserve,
      ENTITLEMENTS_SECRET: preserve,
      // Provider credentials. Real values are set out-of-band, never in git.
      // Empty is safe: payments/src/config.ts:58 reads `|| null`, so an unset
      // provider disables checkout instead of charging against a fake key.
      MP_ACCESS_TOKEN: preserve,
      MP_PUBLIC_KEY: preserve,
      MP_WEBHOOK_SECRET: preserve,
      PUBLIC_ORIGIN: prod ? "https://aifromscratch.shop" : "https://web-dev-a8ad.up.railway.app",
      WEBHOOK_PUBLIC_ORIGIN: prod ? "https://pagos.aifromscratch.shop" : "https://payments-dev.up.railway.app",
      META_PIXEL_ID: preserve,
      META_CAPI_TOKEN: preserve,
      NODE_ENV: prod ? "production" : "development",
      APP_ENV: prod ? "PROD" : "DEV",
    },
  });

  // ---------- api ----------
  // Shared secrets are REFERENCES to their owner, not independent copies. Two
  // `preserveExisting` entries for one logical secret have nothing keeping them
  // equal: rotate JWT_SECRET on api alone and api-worker keeps validating with
  // the old key, so queued jobs fail silently.
  const api = service("api", {
    ...common,
    root: "app_ai_from_scratch",
    build: apiBuild,
    // Migrations AND content. `db:deploy` alone leaves an empty catalogue:
    // /api/lessons answered {"lessons":[]} and /api/progress totalLessons 0 in
    // DEV. api/Dockerfile:56 runs the seed in its `migrate` stage, which
    // Railway never builds. The seed is idempotent by design
    // (api/src/seed.ts:1-2) and its root/demo accounts stay off because
    // SEED_ROOT_USER and SEED_DEMO_USERS are unset (seed.ts:19, :443), so only
    // lessons, labs and quizzes are written. If it fails the deploy aborts,
    // which is the intended fail-closed behaviour.
    // `sh -c` on purpose. `&&` needs a real shell: in exec form it is passed as
    // a literal argument. docker-compose.yml:198-203 records the same bug in
    // this repo's RabbitMQ healthcheck ("the exec form passes `&&` as a literal
    // ARGUMENT ... too many arguments"). Not worth re-learning.
    preDeploy: "sh -c 'pnpm db:deploy && node dist/api/src/seed.js'",
    healthcheck: "/api/health",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      AMQP_URL: broker.env.AMQP_URL,
      DATA_URL: INTERNAL("data"),
      DATA_SECRETO: data.env.DATA_SECRETO,
      // api/src/ai-bridge.ts:66 reads IA_SECRETO (Spanish I), not AI_SECRETO.
      // The old name left the AI tutor answering `sin_secreto`
      // (ai-bridge.ts:102) while the `ai` service stayed Online and billed.
      IA_URL: INTERNAL("ai"),
      IA_SECRETO: ai.env.IA_SECRETO,
      // Dead weight, declared only so IaC does not delete it. Nothing in the
      // codebase reads AI_SECRETO — grep it: the only reader is IA_SECRETO
      // above. Drop this line whenever a destructive apply is acceptable.
      AI_SECRETO: preserve,
      PAYMENTS_URL: INTERNAL("payments"),
      PAYMENTS_SECRET: payments.env.PAYMENTS_SECRET,
      ENTITLEMENTS_SECRET: payments.env.ENTITLEMENTS_SECRET,
      MESSAGES_URL: INTERNAL("messages"),
      MESSAGES_SECRET: messages.env.MESSAGES_SECRET,
      QUEUE_SECRETO: preserve,
      JWT_SECRET: preserve,
      // api/src/mail.ts:41 returns undefined when both are unset, and every
      // mail path then answers 503 `correo_no_configurado` — password reset
      // included. Set the real Resend key out-of-band to close that.
      RESEND_API_KEY: preserve,
      MAIL_FROM: preserve,
      WEB_ORIGIN: prod ? "https://aifromscratch.shop" : "https://web-dev-a8ad.up.railway.app",
      NODE_ENV: "production",
      APP_ENV: prod ? "PROD" : "DEV",
    },
  });

  // ---------- workers ----------
  // Same image as api, different entrypoint. Every shared secret references api
  // or its owner, so the two can never drift apart.
  const worker = service("api-worker", {
    ...common,
    root: "app_ai_from_scratch",
    build: apiBuild,
    start: "node dist/api/src/worker.js",
    deploy: { restartPolicyType: "ON_FAILURE" },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      AMQP_URL: broker.env.AMQP_URL,
      JWT_SECRET: api.env.JWT_SECRET,
      DATA_URL: INTERNAL("data"),
      DATA_SECRETO: data.env.DATA_SECRETO,
      IA_URL: INTERNAL("ai"),
      IA_SECRETO: ai.env.IA_SECRETO,
      QUEUE_SECRETO: api.env.QUEUE_SECRETO,
      NODE_ENV: "production",
      APP_ENV: prod ? "PROD" : "DEV",
    },
  });

  // The Python consumer (docker-compose.yml:402) had no Railway service at all,
  // so every AI job enqueued on Railway had nobody to run it.
  const aiWorker = service("ai-worker", {
    ...common,
    root: "app_ai_from_scratch/ai",
    build: node,
    start: "sh -c '.venv/bin/python -m course_ai.worker'",
    deploy: { restartPolicyType: "ON_FAILURE" },
    env: {
      AMQP_URL: broker.env.AMQP_URL,
      NODE_URL: INTERNAL("api"),
      IA_SECRETO: ai.env.IA_SECRETO,
      BUS_CLAIM_URL: `${INTERNAL("api")}/api/v3/interno/bus/claim`,
    },
  });

  // ---------- defense ----------
  // api publishes `defense.signal.*` on every auth event (api/src/server.ts:160)
  // and Oracle is its only consumer (security/cmd/oracle/main.go:104,
  // security/binding/binding.go:83 binds "defense.signal.#"). Without Oracle
  // the broker answers `unroutable: no queue bound for
  // "defense.signal.auth.login_succeeded"` (api/src/bus.ts:435), the publisher
  // logs it at INFO and the request still succeeds — so every registration and
  // login was dropping its security signal in silence.
  //
  // This is NOT one of the host-namespace defense containers: morpheus needs
  // the host network to inspect real listeners, Oracle does not
  // (docker-compose.yml:592-604 sets no network_mode).
  //
  // DEFENSE_MODE stays `propose`: it emits proposals, it does not act.
  // The audit trail is append-only state, so it needs a volume — the same
  // mistake as the broker running without one.
  const defenseAudit = volume("defense-audit", { sizeMB: 512 });
  const oracle = service("oracle", {
    ...common,
    root: "app_ai_from_scratch",
    build: { builder: "DOCKERFILE", dockerfilePath: "security/Dockerfile", watchPatterns: ["security/**"] },
    // security/Dockerfile:97 is FROM scratch with USER 10001 — no shell, so the
    // binary is the whole command. No healthcheck either: Oracle is a bus
    // consumer with no HTTP surface and Railway healthchecks are HTTP-only.
    start: "/oracle",
    volumeMounts: { "/var/lib/defense": defenseAudit },
    deploy: { restartPolicyType: "ON_FAILURE" },
    env: {
      AMQP_URL: broker.env.AMQP_URL,
      APP_ENV: prod ? "PROD" : "DEV",
      DEFENSE_MODE: "propose",
      DEFENSE_WATCH_WINDOW: "5m",
      DEFENSE_AUDIT: "/var/lib/defense/audit.jsonl",
    },
  });

  // ---------- web ----------
  const web = service("web", {
    ...common,
    root: "app_ai_from_scratch/web",
    build: node,
    // /healthz is a real liveness endpoint (web/src/pages/healthz.ts) and it
    // answers 200. /robots.txt is static: it stays 200 even when the SSR
    // runtime is dead, so Railway would route traffic into a broken container.
    healthcheck: "/healthz",
    domains: prod ? ["aifromscratch.shop"] : [],
    env: {
      // The browser never reaches api directly; web/src/pages/api/[...path].ts
      // proxies server-side, so this stays on the private network.
      API_URL: INTERNAL("api"),
      // web/src/lib/site.ts:3 falls back to http://localhost:4321, which would
      // put localhost into every canonical URL and og:image.
      PUBLIC_SITE: prod ? "https://aifromscratch.shop" : "https://web-dev-a8ad.up.railway.app",
      PUBLIC_META_PIXEL_ID: preserve,
      APP_ENV: prod ? "PROD" : "DEV",
    },
  });

  // No cron service yet, on purpose: `api/package.json:28` runs
  // `scripts/close-leagues.mjs`, and the api runtime image copies only dist/,
  // files/ and prisma/ (api/Dockerfile:70-73). A cron declared here would fail
  // every Monday without anyone noticing. Ship it with the Dockerfile change
  // that copies scripts/.
  //
  // No CPU/RAM limitOverride yet either: there are no measurements, and
  // inventing limits is worse than Railway's defaults. Set them after the load
  // test. Postgres backupSchedules are not settable from here — `postgres()`
  // takes only DatabaseConfig, so snapshots go through the CLI/dashboard.
  return project("ai-from-scratch", {
    resources: [
      group("core", [web, api, data, ai]),
      group("async", [worker, aiWorker, payments, messages, broker, oracle]),
      db, paymentsDb, messagesDb, cache, files, brokerData, defenseAudit,
    ],
  });
});
