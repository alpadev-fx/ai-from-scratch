# Production: GO / NO-GO

Cut 2026-09-10 08:05 UTC. Environment `Production`
(`d96fbafe-7f4b-4cad-9feb-260562dd4b48`), project `ai-from-scratch`
(`4015473a-e3f1-4bad-b2c0-6969428c2d65`).

Every line was read from Railway or from a command run today. Where an earlier
version of this file was wrong, the correction says so rather than quietly
replacing it.

## Where the two environments stand

Updated 08:05 UTC, after PR #3 was merged and the IaC applied.

| | Production | Devevelopment |
|---|---|---|
| services | 19 | 19 |
| `SUCCESS` | **19** | **19** |
| `FAILED` | 0 | 0 |
| no deployment yet | 0 | 0 |
| commit | `4d08efb2` (main) | `4d08efb2` (dev) |

Both environments are green end to end. Measured, not inferred:

```
https://aifromscratch.shop/                              200  0.88s   19x 39.990, no 35.000, no 99.999
https://api-production-ed82c.up.railway.app/api/health   200  0.31s
436f...74.aifromscratch.shop/                            401  0.37s   (DEV gate asking for the password)
```

`railway config plan` against Production: **`0 to add, 43 to change, 0 to destroy`**.
Nothing is missing and nothing is at risk, but the apply did not converge the
config. `deploy.restartPolicyType` is still `null` on `oracle`, `morpheus`,
`trinity`, `smith`, `neo` and `api-worker`, where the file declares `ON_FAILURE`
— **a crash on any of those is not retried**, and for the defence agents that
means going quiet while the dashboard stays green. A second `railway config
apply` closes it. The rest of the 43 is `buildCommand → null` on seven
DOCKERFILE-built services, which Railway ignores anyway, plus `preserve()`
variable rows.

Tracked in Linear: [IA desde cero · Railway Pro](https://linear.app/ledgerfi/project/ia-desde-cero-railway-pro-9dd642d03984)
(LED-3049 … LED-3064).

## The three failures, and what each one actually was

### `oracle` — diagnosed, fixed, landed in Production.

Five deployments across two environments and two Metal builders failed with
**one** build-log line, `scheduling build on Metal builder`, and no diagnostic.
`BUILD_IMAGE` reported only the generic `Failed to build an image. Please check
the build logs for more details.` after 3.9 s — a tenth of the time the Go
compile alone takes.

The error was never missing. It is outside the default log window:

```
2026-09-10T06:41:47.302 dockerfile invalid: docker VOLUME at Line 139 is not
                        supported, use Railway Volumes
```

`buildLogs(deploymentId:)` returns 1 line for that deployment. The same query
with an explicit `startDate` earlier than the scheduling timestamp returns 4,
and the rejection is the third. **Anyone debugging a Railway build that fails
with one log line should query with an explicit date window before concluding
anything.** Railway rejects the Dockerfile during `SNAPSHOT_CODE`, so no step
output exists to read.

Two hypotheses were wrong on the way here and both are recorded so nobody
re-derives them:

- **`go test` in the test stage exhausting the builder.** Removed in `b11e00b`;
  the sixth deployment failed identically. Refuted.
- **The Railway volume colliding with the mount.** Not the mechanism. It was the
  `VOLUME` *instruction*, which Railway bans outright, not the mount.

Fixed in `6105383`: the instruction is deleted. Nothing depended on it —
`docker-compose.yml` binds `defenseaudit:/var/lib/defense` at lines 528, 552 and
580, and Railway mounts its own volume at the same path. Rebuilt with the
identical context Railway uses and `--platform linux/amd64`: `BUILD_EXIT: 0`,
7 layers, all six binaries (`security 0.1.0 (morpheus trinity smith oracle
neo)`). The only change in `docker image inspect` is `Config.Volumes` going from
`{"/var/lib/defense":{}}` to `{}`.

**Proven, not assumed:** `main` is `4d08efb` and
`git show alpadev-fx/main:app_ai_from_scratch/security/Dockerfile | grep -c '^VOLUME'`
returns 0. Railway rebuilt on its own (`watchPatterns: ["security/**"]` matched)
and `oracle` is `SUCCESS` on `4d08efb2`. The four agents that build the same
image — `morpheus`, `trinity`, `smith`, `neo` — are `SUCCESS` too. Six failed
builds, then five services green off one deleted line.

### `api` — was down, is fixed.

`api` was `FAILED` in Production, and the runtime log said why:

```
file:///app/api/dist/api/src/mail.js:40
Error: RESEND_API_KEY and MAIL_FROM must be set together (or both unset)
```

`RESEND_API_KEY` was present but empty and `MAIL_FROM` carried a value, so the
both-or-neither guard at `api/src/mail.ts:42` threw at module load, the process
died, and the healthcheck retried for the full 5 minutes before giving up. This
was **a variable, not code** — and the guard did exactly its job.

`MAIL_FROM` was cleared in Production to match DEV, where both are empty and the
service boots. Railway redeployed on the variable change and `api` reached
`SUCCESS`. `railway.ts:209-210` declares both as `preserve`, so the next apply
keeps them empty rather than restoring the broken half-set state.

The trade, stated: with both unset, `loadMailer()` returns `undefined` and
password recovery answers 503. That is fail-closed and correct — there is no
Resend key to send with. It is not a fix for email; it is a fix for `api` being
dead.

### `payments` — was a credential. Now up, and the webhook was pointed at nowhere.

```
file:///app/dist/config.js:46
Error: production requires MP_ACCESS_TOKEN to start with APP_USR-
```

All three Mercado Pago variables were present and empty, the service crash-looped
and the healthcheck burned its full 5-minute window (307.8 s from create to
`FAILED`). No deploy was ever going to change that.

Live `APP_USR-` credentials are now set **in Production only** and `payments` is
`SUCCESS`. Not in DEV, deliberately: `payments/src/config.ts:79` throws when an
`APP_USR-` token runs outside production without
`MP_ALLOW_LIVE_OUTSIDE_PRODUCTION=1`, so setting them there breaks DEV *and*
leaves DEV charging real cards. DEV's `payments` is green with empty variables
because the `APP_USR-` check only fires in production — **do not read DEV green
as checkout working.**

**The part that would have cost money.** With credentials in place checkout takes
money, and `WEBHOOK_PUBLIC_ORIGIN` was `https://pagos.aifromscratch.shop`, which
does not resolve — `dig +short` returns nothing. This file used to claim the
domain was added out of band with `railway domain`; it never was. A charge would
have succeeded and the notification would have been lost, so the buyer pays and
is never granted access.

The DEV value was wrong too, differently: it pointed at the payments service, but
`payments/src/mercadopago.ts:72` builds
`${origin}/api/payments/mercadopago/webhook`, served by `api/src/server.ts:1080`.
`payments/src/server.ts` exposes only `/health` and three `/v1/admin` routes.

Both now point at the **api** origin, and at the generated Railway domains rather
than a tunnel hostname — a webhook must not depend on the connector on a laptop.
Verified: a `POST` with an empty body returns `400 {"error":"missing_data_id"}`,
which is payments' own error, so the `api → payments` hop works.

Checked and dropped: whether `api` needs `MP_WEBHOOK_SECRET`. It does not — it is
a pure gateway forwarding `x-signature`, and the signature is verified in
`payments`.

**Two things still open.** The three credentials were pasted into a chat and are
compromised; they must be rotated. And no real purchase has been made end to end,
so the money path is configured but not yet observed working.

## The IaC was about to destroy three things

`railway config plan` against Production emitted:

```
- Delete bucket dev-files
~ Update rabbitmq-data config.sizeMB (50000 -> 1024)
~ Update defense-audit config.sizeMB (50000 -> 512)
! 3 destructive change(s) will remove Railway resources or variables.
```

Fixed in `c52dd42`. Both environments now plan **`0 to destroy`**.

**The bucket.** Buckets are project-level, so every plan sees every bucket, and
IaC prunes buckets — unlike volumes and domains, which it leaves alone.
`bucket(prod ? "prod-files" : "dev-files")` left the other environment's bucket
undeclared, and a Production apply would have deleted the DEV one. Both are now
declared *and* listed in `resources`; declaring is not enough, because
`resources` is an explicit list and a bucket missing from it is undeclared.
Railway leaves `bundled-taco-LGCj` alone in the same plan, which is how you can
tell the pruning is scoped to IaC-managed buckets.

**The volumes.** The size is now per environment, declaring what each
environment's volume actually is. DEV's are 1024 MB and 512 MB — exactly what
the file asks for, because the file created them, which is also the proof that
Railway honours `sizeMB` on create. Production's are both 50000 MB because they
predate the file. One number for both moves data in one direction or the other.
Shrinking Production is a migration with a drain step, not a plan side effect:
`rabbitmq-data` holds undelivered messages — an unconsumed paid webhook lives
there — and `defense-audit` holds the append-only log of what the defence agents
decided.

## Verdict by area

| Area | Verdict | The evidence, and what is missing |
|---|---|---|
| Application | **GO, with one gap** | 19 of 19 `SUCCESS` on `4d08efb2`. The gap is `restartPolicyType` still `null` on six services — a crash is not retried. One more apply. |
| Public site | **GO, on a laptop** | `https://aifromscratch.shop` answers 200 and is **byte-identical** to `web-production-486c3.up.railway.app` (53868 bytes both), differing from DEV by 4 lines. It answered **530** before 07:13 UTC today because the tunnel connector had died. See DNS/TLS. |
| Payments | **GO, credentials compromised** | Live `APP_USR-` credentials are set in Production only and `payments` is `SUCCESS`. `WEBHOOK_PUBLIC_ORIGIN` was pointing at `pagos.aifromscratch.shop`, which does not resolve, so a charge would have succeeded with the notification lost; it now points at the `api` origin and the `api → payments` hop is verified (`400 missing_data_id`). The three credentials were pasted into a chat and **must be rotated**. No real purchase has been made end to end yet. |
| Email | **NO-GO** | `RESEND_API_KEY` unset, deliberately, so `api` boots. Deeper: the 20 templates in `design/saas-emails/templates.ts` are unreachable — `saas-emails`, `renderEmailHtml` and `EMAIL_SPECS` return zero matches across every service — and `api/src/mail.ts:15` declares `send({ to, subject, text })` with no `html` field, so the transport could not carry them. |
| Defence agents | **GO, with the restart gap** | All five `SUCCESS` in both environments. But `restartPolicyType` is `null` on all five in Production, so a crashed agent is never restarted — the exact silent-failure shape the agents exist to catch. |
| Railway Bucket — connectivity | **GO** | Verified against `prod-files-fbfvpaewjuomum` at `https://t3.storageapi.dev` through `railway run --service api`: write, read back byte-identical, delete, absent afterwards. |
| Railway Bucket — actually used | **NO-GO** | The bucket is empty and no code path touches it. `api/files` is 2.4 MB in two files, baked into the image and served behind the paywall at `api/src/server.ts:868`. |
| DNS / TLS | **NO-GO** | Production has no custom domain. The apex is a Cloudflare Tunnel whose connector runs on the operator's laptop: it died today and the site answered 530 until restarted, and it will do that again on the next sleep. Needs a Cloudflare API token for the account owning the zone (`0d7ce2fb5340a4e778d2e9f1e6c1d838`); the token on this machine belongs to a different account and sees only `alpadev.xyz`. |
| Backups — schedules | **GO** | `course-db-volume`, `payments-db-volume` and `messages-db-volume` each carry DAILY (6 d), WEEKLY (27 d) and MONTHLY (89 d), read back after applying. Before today all ten Production volumes had none. |
| Backups — restore | **NO-GO** | No restore attempted against Production and no owner named for the drill. A configured schedule is not a backup. |
| Backups — logical dumps | **NO-GO** | `scripts/backup.sh` is 520 bytes of `docker compose exec … pg_dump` writing locally. It was written for the Compose/Pi deployment; there is no `docker-compose.yml` and no host on Railway. Nothing fills this. |
| RabbitMQ credentials | **UNVERIFIED** | The variable and `AMQP_URL` were rotated and the service restarted, but RabbitMQ keeps its internal user in the volume, so the `app` password may still be the old one. `railway ssh` could not be used: the available key belongs to a different Railway workspace. |
| Service exposure | **NO-GO** | `api` and `data` carry public `*.up.railway.app` domains in **both** environments. `api/src/server.ts:144` guards with `if (!req.headers['cf-ray']) return;` — a header a client sets freely, so the guard is fail-open, and the brief requires fail-closed. |

## What only the owner can do

1. ~~Merge PR #3.~~ **Done** — merged as `4d08efb`, and the IaC applied. Run one
   more `railway config apply` to set the six missing restart policies.
2. Mercado Pago `MP_ACCESS_TOKEN` (`APP_USR-`), `MP_PUBLIC_KEY`,
   `MP_WEBHOOK_SECRET` — newly issued, because the previous values were pasted
   into a chat and must be treated as compromised.
3. A new `RESEND_API_KEY`, on a domain with SPF, DKIM and DMARC.
4. A Cloudflare API token for the account that owns `aifromscratch.shop`, so the
   apex becomes a CNAME to Railway and the laptop leaves the path.
5. A decision on the billable inventory: three buckets where two are declared
   (`bundled-taco-LGCj` is an orphan) and ten volumes where five are declared
   (`redis-volume`, `redis-volume-IV7i`, `redis-volume-Q5bh`,
   `redis-volume-cVP2` are Redis-shaped orphans; `cache-volume` is the live one).
6. A named owner for the restore drill.
7. Whether to shrink Production's `rabbitmq-data` and `defense-audit` from 50 GB,
   which needs a drain and a swap.

## The sequence, once PR #3 is merged

Order matters. Applying before the merge would create the four defence agents
pointing at `main`, whose `security/Dockerfile` still carries the banned
`VOLUME` — four new services failing exactly as `oracle` did.

```bash
gh pr merge 3 --repo alpadev-fx/ai-from-scratch --merge --admin

cd ~/Desktop/course/AIFromScratch/infrastructure
railway environment Production
railway config plan            # expect: 7 to add, 39 to change, 0 to destroy
railway config apply --yes     # creates morpheus, trinity, smith, neo, cron-leagues

railway redeploy --service oracle --environment Production --yes
```

`railway config plan` and `apply` must run **bare** — no wrapper, no env prefix.
A prefixed invocation breaks on `$_`.
