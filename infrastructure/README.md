# infrastructure

Railway infrastructure for the course platform. This repo holds the desired
state and nothing else: no application code, no secret values.

- Railway project: `ai-from-scratch` — `4015473a-e3f1-4bad-b2c0-6969428c2d65`
- Environments: **`Devevelopment`** (`b7961961-a646-4b45-b0db-e1ef5504f549`) and
  **`Production`** (`d96fbafe-7f4b-4cad-9feb-260562dd4b48`) — renamed from
  DEV/PROD on 2026-09-10, typo included. The IDs did not change. See
  "The environment rename" below before writing any `isEnvironment` check.
- Deploy source: `github.com/alpadev-fx/ai-from-scratch`, declared inside
  `.railway/railway.ts`. PROD tracks `main`; DEV tracks `dev`.

`dev` is branched from `main` on purpose, so `git log main..dev` is exactly the
set of commits waiting to be promoted. It replaced `mvp-readiness/2026-09` on
2026-09-10: a permanent environment pointed at a feature branch stops deploying
the day that branch is deleted.

The application lives in a different repo on purpose, but the two are coupled:
every service in `railway.ts` names a `dockerfilePath`, `watchPatterns`,
`start` and `preDeploy` that only exist at a specific commit of the app. A
rename there breaks a deploy here. Land both sides together.

## First use on a new machine

```bash
cd .railway && npm install && cd ..
railway link --project 4015473a-e3f1-4bad-b2c0-6969428c2d65 --environment Devevelopment
railway status          # confirm the environment before anything else
```

## The two commands

```bash
railway config plan     # read-only diff, safe to run any time
railway config apply    # writes. answer the connect prompt once, see below
```

**Run both bare.** No `timeout`, no `VAR=x railway ...` prefix. The SDK shells
out to `process.env._` (`node_modules/railway/dist/iac/index.js:41`), which is
the shell's last-argument variable, so any wrapper makes it exec the wrong
binary and fail with a misleading *"requires Railway CLI 5.42.1 or newer"* even
on a much newer CLI. Every other `railway` subcommand tolerates a prefix.

**`apply` asks once for a binding that `plan` does not**, and `--yes` does not
cover it:

```
Where should Railway apply this configuration?  → Use an existing Railway project
Project                                         → ai-from-scratch
Environment                                     → DEV        (never PROD by reflex)
```

Answer it from **this** directory. Running `railway config apply` from an
unlinked directory offers *Create a new Railway project*, which scaffolds a
stub and can leave you paying for a second project. That happened on
2026-09-09 from `~/Desktop/course`; the stub is parked at
`~/Desktop/course/.railway/railway.ts.disabled`.

**Read the environment off the plan's own header before trusting it.** On
2026-09-10 this directory was linked to **PROD**, so `railway config plan`
answered `Plan: 20 to add` — the entire stack, because PROD is empty — and an
apply would have provisioned production with empty databases, no secrets and no
backup schedules. It looked like a normal plan. The first four lines of every
plan name the environment; check them, and re-link with:

```bash
railway link --project 4015473a-e3f1-4bad-b2c0-6969428c2d65 --environment Devevelopment
railway status | grep -i environment
```

## The environment rename

On 2026-09-10 the environments were renamed from `DEV`/`PROD` to
`Devevelopment`/`Production`. Same IDs, new names, and the typo is real. Two
things broke.

`railway link --environment DEV` now fails with *Environment "DEV" not found.
Available: Devevelopment, Production*. Every command in this file uses the new
names.

The dangerous one was silent. `railway.ts` decided everything from
`ctx.isEnvironment("PROD") || ctx.isEnvironment("production")`, and the SDK
implements that as plain `===` — exact, case-sensitive
(`node_modules/railway/dist/iac/index.js:85`). Against `Production` both checks
returned false, so `prod` became false and applying to the production
environment would have configured it as DEV: tracking the `dev` branch, using
the `dev-files` bucket, announcing `APP_ENV=DEV`, and pointing `PUBLIC_ORIGIN`
and `WEBHOOK_PUBLIC_ORIGIN` at DEV so Mercado Pago would deliver webhooks to the
wrong origin. Nothing in the plan would have looked alarming.

It now matches a prefix (`/^prod/i`) so a rename cannot break it, and throws on
a name that starts with neither `dev` nor `prod` rather than falling through to
DEV. Do not reintroduce `isEnvironment` for this.

## Production is already provisioned

Earlier notes in this file said PROD had never been deployed. That is wrong as
of 2026-09-10: `Production` carries all fourteen services — api, web, ai, data,
payments, messages, api-worker, ai-worker, oracle, rabbitmq, course-db,
payments-db, messages-db, cache.

Its `api` has Railway Bucket credentials that this file did not declare:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`
(`https://t3.storageapi.dev`), `AWS_S3_BUCKET_NAME`
(`prod-files-fbfvpaewjuomum`), `AWS_S3_URL_STYLE`, `AWS_DEFAULT_REGION`. IaC
deletes undeclared variables, so an apply would have stripped production of its
storage credentials — six `Delete variable` lines in a 42-change plan. They are
declared `preserveExisting` now, which took the Production plan from
`7 to destroy` down to `1`.

The DEV api has **none** of them, so DEV cannot write to `dev-files` at all.
Fill them from the DEV bucket's own credentials. Do not copy the production
values across; two buckets exist precisely so that cannot happen.

The one remaining destroy is `- Delete bucket dev-files` in Production, where it
does not belong — the production api points at `prod-files`. **Do not let an
apply do it.** Railway's delete semantics for a bucket shared across
environments are not documented here, and if it is project-wide it takes DEV's
bucket with it. Detach it by hand and confirm it is empty first.

Inventory that needs cleaning, all of it billable: three buckets where two are
declared (`prod-files`, `dev-files`, and an orphan `bundled-taco-LGCj`), and
five Redis-shaped volumes where one is declared (`cache-volume`, `redis-volume`,
`redis-volume-IV7i`, `redis-volume-cVP2`, `redis-volume-Q5bh`).

## Rules that are not style preferences

**IaC deletes any variable the file does not declare.** It does *not* prune
domains, volumes or buckets. So anything set with `railway variable set` must
be added to `railway.ts` as `preserveExisting` in the same breath, or the next
apply removes it. This already cost the AI router two of its four providers
before the declaration landed.

**`volumeMounts` is keyed by mount path, not volume name.**

```ts
volumeMounts: { "rabbitmq-data": { mountPath: "/var/lib/rabbitmq" } }  // WRONG
volumeMounts: { "/var/lib/rabbitmq": brokerData }                      // right
```

The wrong form compiles to `volumeAttachments: {}` — accepted, no diff, no
diagnostic — and `railway status` keeps reporting the volume as `detached`
while the plan claims there is nothing to do.

**Never apply to PROD to "see what happens".** PROD has never been deployed and
has no backup schedules. Applying there provisions the whole stack at once and
runs `preDeploy` migrations against empty databases.

## The deploy repo

`railway.ts` declares `alpadev-fx/ai-from-scratch`. Railway is still connected
to `Alxn44/ai-from-scratch`, so `config plan` lists `~ Update source.repo` on
all eleven services. Three names are in play and only two of them are one repo:

| repo | `main` | `mvp-readiness/2026-09` |
|---|---|---|
| `Alxn44/ai-from-scratch` | `3f80e3f` | `258bdf2` |
| `LedgerFi-Inc/ai-from-scratch` (`origin`) | `3f80e3f` | `258bdf2` |
| `alpadev-fx/ai-from-scratch` | `da9e39b` | `9849ddd` |

`Alxn44` and `LedgerFi-Inc` are the **same repository** — identical SHAs, GitHub
redirecting the old name after the transfer. `alpadev-fx` is a separate fork,
and it is the one carrying the work: its `main` is `origin/main` with the whole
readiness branch merged in through its PR #1 (`git merge-base` is exactly
`3f80e3f`, and nothing is missing in the other direction).

That is why the repoint matters more than it looks. PROD tracks `main`. Pointed
at the org repo, a PROD apply deploys `3f80e3f` — the stale September-1 code
that still sells the old price. Pointed at the fork, it deploys `da9e39b`, which
has the current price. The trade taken deliberately on 2026-09-10: deploys come
from the fork, so `origin` is no longer the source of truth for what is running,
and branch protection or CI on the org repo no longer gates a deploy.

**Not verified:** whether Railway's GitHub App can read `alpadev-fx`. Both repos
are public, which is what makes this likely fine, but the check is worth twenty
seconds in the dashboard before an apply, because a repoint the App cannot
follow leaves all eleven services with no buildable source in both
environments. `gitHubRepoAccessAvailable` is not usable for this from the CLI:
it answers `Not Authorized` even for `Alxn44`, the repo Railway is provably
deploying today, so the failure is token scope and the query says nothing about
the repo.

## The DEV access gate

DEV is reachable at `436f726e656c6975732056616e64657262696c74.aifromscratch.shop`
behind HTTP Basic auth. `edge/` holds the Cloudflare Worker that enforces it,
its wrangler config and its tests.

**The hostname is not a secret, and treating it as one is the mistake to avoid.**
It is hex for a name, and hex is not encryption. What actually keeps it out of
public view is that the DNS record is **proxied**: the request is served under
Cloudflare's existing `*.aifromscratch.shop` certificate, so no new certificate
is issued for this label and nothing lands in the Certificate Transparency logs.
Turn the proxy off, or register the same hostname as a Railway custom domain, and
Railway issues its own certificate — at which point `crt.sh` lists the name
within minutes and the obfuscation is gone for good, because CT is append-only.

**The gate is a Worker and not app middleware for a concrete reason.**
`web/astro.config.mjs` sets no `output`, so Astro defaults to static and
individual pages opt into server rendering with `prerender = false`. Astro
middleware runs at BUILD time for prerendered pages, so a middleware gate would
leave every static page — the landing included — served unauthenticated by the
node standalone adapter. The gate has to sit in front of the origin.

**What it does not protect.** `web-dev-a8ad.up.railway.app` stays publicly
reachable and does not pass through the Worker, so that hostname skips the
password entirely. The gate protects the pretty domain; it does not make DEV
private. Railway cannot currently express "answer only this Worker", so closing
it means deleting the service domain — and then the Worker has no origin to
fetch. The exposure is unchanged from before the gate existed; the gate adds a
door, it does not remove the other one.

The chosen password is six characters and a dictionary word. Basic auth has no
rate limiting of its own, so the real protection is Cloudflare's — add a
rate-limit rule on the hostname, or raise the password, before treating this as
a control rather than a speed bump. The value lives only in
`wrangler secret put DEV_GATE_PASSWORD`; it is deliberately absent from this
repo, including the tests.

### Deploying it

Blocked on credentials as of 2026-09-10: the `CLOUDFLARE_API_KEY` in
`AIFromScratch/.env` is a valid token but can see exactly one zone,
`alpadev.xyz`. `aifromscratch.shop` is on a different Cloudflare account — its
nameservers are `paislee`/`dakota`, `alpadev.xyz`'s are `jason`/`violet`. A
token for the right account needs Zone→DNS→Edit and Zone→Workers Routes→Edit on
`aifromscratch.shop`, plus Account→Workers Scripts→Edit.

```bash
cd edge
node dev-gate.test.mjs                 # 13 assertions, incl. a live origin fetch
npm i -g wrangler && wrangler login
wrangler secret put DEV_GATE_PASSWORD  # never in wrangler.toml
wrangler deploy
```

The DNS record is a **proxied AAAA to `100::`** — the IPv6 discard prefix. There
is no origin at DNS level; the Worker answers everything. This is what keeps the
label under the wildcard certificate.

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"AAAA","name":"436f726e656c6975732056616e64657262696c74","content":"100::","proxied":true}'
```

Verify, in this order — a 200 without credentials means the Worker route did not
attach and DEV is publicly served:

```bash
H=436f726e656c6975732056616e64657262696c74.aifromscratch.shop
curl -s -o /dev/null -w '%{http_code}\n' "https://$H/"            # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -u dev:PASSWORD "https://$H/"  # expect 200
```

Then set `PUBLIC_SITE` for DEV to `https://$H` in `.railway/railway.ts` — **not
before the domain answers**, because `web/src/lib/site.ts:3` feeds it to every
canonical link and the sitemap, and pointing those at a hostname that does not
resolve breaks them.

## What this file cannot express

Three things are configured out of band and will not show up in a plan:

- **Custom domains.** Railway configuration rejects custom-domain registration.
  After the PROD services exist, add `aifromscratch.shop` to `web` and
  `pagos.aifromscratch.shop` to `payments` with `railway domain`, then configure
  the returned verification/routing records at the DNS provider.

- **Postgres backup schedules.** `postgres()` accepts only `DatabaseConfig`, and
  `VolumeInstance` has no `backupSchedules` field, so DAILY/WEEKLY/MONTHLY are
  set through the API or the dashboard. DEV's three databases have all three
  (verified by `volumeInstanceBackupScheduleList`); PROD has none.
- **Secret values.** Every secret here is either `preserveExisting` on the
  service that owns it or a reference to that owner. Set the values in the
  dashboard or with `railway variable set`.

Shared secrets are references, never copies. `api.IA_SECRETO` points at
`ai.IA_SECRETO`; `api-worker.JWT_SECRET` points at `api.JWT_SECRET`. Two
independent `preserveExisting` entries for one logical secret have nothing
keeping them equal — rotate one side and the other keeps validating with the
old key, and queued jobs fail without an error anyone sees.

## Escape hatch when `apply` is unavailable

`serviceInstanceUpdate` changes deploy config for an existing service without a
full apply. Use it for `preDeployCommand`, `sleepApplication`,
`restartPolicyType`, `healthcheckPath`, `numReplicas` — not to create services.

```bash
railway api 'mutation U($sid: String!, $eid: String!, $input: ServiceInstanceUpdateInput!) {
  serviceInstanceUpdate(serviceId: $sid, environmentId: $eid, input: $input) }' \
  --variables '{"sid":"<service>","eid":"b7961961-a646-4b45-b0db-e1ef5504f549","input":{"sleepApplication":false}}'
```

Verify with a direct read, not with `config plan` — the plan reported
`restartPolicyType (null → ON_FAILURE)` as pending on services that already had
it:

```bash
railway api 'query S($sid: String!, $eid: String!) {
  serviceInstance(serviceId: $sid, environmentId: $eid) {
    preDeployCommand sleepApplication restartPolicyType } }' \
  --variables '{"sid":"<service>","eid":"b7961961-a646-4b45-b0db-e1ef5504f549"}'
```

DEV service IDs: `api` `029ca878-5ee7-456f-a7aa-2f555fb143b7` · `ai`
`e07d735c-a466-4322-927e-3b8c439caeeb` · `api-worker`
`1b1defa6-29cd-49b8-b25a-ffad46d12498` · `ai-worker`
`bec4f6c2-c68e-44ba-8392-e1495b703059`

## What stayed in the application repo, and why

`AIFromScratch/app_ai_from_scratch/scripts/` keeps `backup.sh`, `restore.sh`,
`backup-drill.sh`, `smoke-prod.sh`, `health-check.sh` and `load-test.js`.
They are wired into that project: `backup-drill.sh` is a `pnpm verify` gate
(`scripts/verify.mjs:302`), and `smoke-prod.sh` / `health-check.sh` are npm
scripts (`package.json:16,54`) documented in `RUNBOOK.md:36,38`. Moving them
breaks `pnpm verify`, which is the one command that project's CLAUDE.md says is
worth knowing.

`docs/railway-architecture.md`, `railway-runbook.md`, `railway-cost-model.md`,
`capacity-report.md` and `disaster-recovery.md` also stayed: they cross-link
each other and `MVP-READINESS.md`.

## Open items

- `railway config apply` has not been run for the current file. `railway config
  plan` reports 34 safe changes, including a new `oracle` service and its
  `defense-audit` volume.
- `api` needs a redeploy for the new `preDeployCommand` to run the content seed;
  deploy config only takes effect on the next deployment. `/api/lessons` answers
  `{"lessons":[]}` until then.
- `RESEND_API_KEY` and `MAIL_FROM` are declared and empty, so
  `/api/auth/recover` answers `503 correo_no_configurado`.
- `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` are declared and empty.
  They need **sandbox** (`TEST-`) values: an `APP_USR-` token in DEV makes
  `payments` throw on boot (`payments/src/config.ts:79`).
- No CPU/RAM `limitOverride` anywhere. There are no measurements to base one on,
  and Railway's defaults beat invented numbers. Set them after a load test.
- ~~No cron service.~~ `cron-leagues` is declared, `5 5 * * 1` (Monday 00:05 in
  America/Bogota, the zone being a constant at `api/src/leagues.ts:27`). It runs
  `dist/api/scripts/close-leagues.mjs`, which only exists because the app repo's
  build stage now copies `api/scripts` and `.dockerignore` allowlists it —
  verified inside the built image, where the entrypoint fails on a missing
  `DATABASE_URL` rather than an unresolved import. It closes a real hole: the
  consumer (`api/src/worker.ts:56`) and the calculation both existed, but
  nothing in production code ever published `league.week.close`, so the league
  week never closed. **It cannot run until the app-repo commit reaches the
  branch the services build.**
