# Production: GO / NO-GO

Cut 2026-09-10 07:20 UTC. Environment `Production`
(`d96fbafe-7f4b-4cad-9feb-260562dd4b48`), project `ai-from-scratch`
(`4015473a-e3f1-4bad-b2c0-6969428c2d65`).

Every line was read from Railway or from a command run today. Where an earlier
version of this file was wrong, the correction says so rather than quietly
replacing it.

## Where the two environments stand

| | Production | Devevelopment |
|---|---|---|
| services | 19 | 19 |
| `SUCCESS` | **12** | **19** |
| `FAILED` | **2** — `oracle`, `payments` | 0 |
| no deployment yet | 5 — `morpheus`, `trinity`, `smith`, `neo`, `cron-leagues` | 0 |
| commit | `a12778bb` (main) | `c52dd42e` (dev) |

DEV is green end to end. Production is three actions away from matching it, and
one of the three needs a credential only the owner has.

## The three failures, and what each one actually was

### `oracle` — diagnosed, fixed, proven. Waiting on a merge.

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

**Proven, not assumed:** DEV now runs `oracle`, `morpheus`, `trinity`, `smith`
and `neo` — five services building that same image — all `SUCCESS`.

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

### `payments` — needs a credential. Nothing else.

```
file:///app/dist/config.js:46
Error: production requires MP_ACCESS_TOKEN to start with APP_USR-
```

`MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` and `MP_WEBHOOK_SECRET` are all present and
empty in Production. The service crash-loops, the healthcheck burns its 5-minute
window (307.8 s from create to `FAILED`), and no deploy will change that.

DEV's `payments` is `SUCCESS` with the same empty variables because the
`APP_USR-` check only fires in production. **Do not read DEV green as checkout
working.** Nothing can be sold in either environment.

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
| Application | **NO-GO, close** | 12 of 19 `SUCCESS` on `a12778bb`. `oracle` fixed but the fix is on `dev`, not `main`. The 4 defence agents and `cron-leagues` exist as service records with no Production deployment, because the apply only ran against DEV. |
| Public site | **GO, on a laptop** | `https://aifromscratch.shop` answers 200 and is **byte-identical** to `web-production-486c3.up.railway.app` (53868 bytes both), differing from DEV by 4 lines. It answered **530** before 07:13 UTC today because the tunnel connector had died. See DNS/TLS. |
| Payments | **NO-GO** | Credential. See above. |
| Email | **NO-GO** | `RESEND_API_KEY` unset, deliberately, so `api` boots. Deeper: the 20 templates in `design/saas-emails/templates.ts` are unreachable — `saas-emails`, `renderEmailHtml` and `EMAIL_SPECS` return zero matches across every service — and `api/src/mail.ts:15` declares `send({ to, subject, text })` with no `html` field, so the transport could not carry them. |
| Defence agents | **NO-GO, unblocked** | All five `SUCCESS` in DEV. Production needs the merge, then an apply. |
| Railway Bucket — connectivity | **GO** | Verified against `prod-files-fbfvpaewjuomum` at `https://t3.storageapi.dev` through `railway run --service api`: write, read back byte-identical, delete, absent afterwards. |
| Railway Bucket — actually used | **NO-GO** | The bucket is empty and no code path touches it. `api/files` is 2.4 MB in two files, baked into the image and served behind the paywall at `api/src/server.ts:868`. |
| DNS / TLS | **NO-GO** | Production has no custom domain. The apex is a Cloudflare Tunnel whose connector runs on the operator's laptop: it died today and the site answered 530 until restarted, and it will do that again on the next sleep. Needs a Cloudflare API token for the account owning the zone (`0d7ce2fb5340a4e778d2e9f1e6c1d838`); the token on this machine belongs to a different account and sees only `alpadev.xyz`. |
| Backups — schedules | **GO** | `course-db-volume`, `payments-db-volume` and `messages-db-volume` each carry DAILY (6 d), WEEKLY (27 d) and MONTHLY (89 d), read back after applying. Before today all ten Production volumes had none. |
| Backups — restore | **NO-GO** | No restore attempted against Production and no owner named for the drill. A configured schedule is not a backup. |
| Backups — logical dumps | **NO-GO** | `scripts/backup.sh` is 520 bytes of `docker compose exec … pg_dump` writing locally. It was written for the Compose/Pi deployment; there is no `docker-compose.yml` and no host on Railway. Nothing fills this. |
| RabbitMQ credentials | **UNVERIFIED** | The variable and `AMQP_URL` were rotated and the service restarted, but RabbitMQ keeps its internal user in the volume, so the `app` password may still be the old one. `railway ssh` could not be used: the available key belongs to a different Railway workspace. |
| Service exposure | **NO-GO** | `api` and `data` carry public `*.up.railway.app` domains in **both** environments. `api/src/server.ts:144` guards with `if (!req.headers['cf-ray']) return;` — a header a client sets freely, so the guard is fail-open, and the brief requires fail-closed. |

## What only the owner can do

1. **Merge PR #3.** `gh pr merge` and `gh api … /merge` are both blocked for the
   agent by the tool classifier. Nothing about `oracle` reaches Production until
   this happens.
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
