# Production: GO / NO-GO

Cut 2026-09-10, America/Bogota. Environment `Production`
(`d96fbafe-7f4b-4cad-9feb-260562dd4b48`), project `ai-from-scratch`
(`4015473a-e3f1-4bad-b2c0-6969428c2d65`).

Every line below was read from Railway or from a command run today. Nothing here
is inferred from the previous handoff, and three of its statements are corrected
at the bottom.

## Verdict

| Area | Verdict | The evidence, and what is missing |
|---|---|---|
| Application | **NO-GO** | 12 of 14 services `SUCCESS` with the app services on `da9e39b`. But `main` does not carry today's fixes (PR #2), there is no public hostname on Production, and two services are down. |
| Payments | **NO-GO** | `payments` is `FAILED`. Its runtime log is unambiguous: `dist/config.js:46` → `production requires MP_ACCESS_TOKEN to start with APP_USR-`. The variable is empty. This needs a credential, not a deploy. |
| Email | **NO-GO** | `RESEND_API_KEY` is unset. Deeper: the 20 templates in `design/saas-emails/templates.ts` are unreachable — `saas-emails`, `renderEmailHtml` and `EMAIL_SPECS` return zero matches across `api/src`, `auth/src`, `payments/src`, `messages/src`, `web/src`, `ai/src` and `scripts` — and `api/src/mail.ts:15` declares `send({ to, subject, text })` with no `html` field, so the transport could not carry them anyway. |
| Railway Bucket — connectivity | **GO** | Verified today against `prod-files-fbfvpaewjuomum` at `https://t3.storageapi.dev` through `railway run --service api`: write, read back byte-identical, delete, and absent afterwards. |
| Railway Bucket — actually used | **NO-GO** | The bucket is empty and no code path touches it. `api/files` is 2.4 MB in two files (one PDF), baked into the image and served behind the paywall at `api/src/server.ts:868`. There is no upload route, no S3 client, no generated certificates and no exports. |
| DNS / TLS | **NO-GO** | Production has no custom domain. `aifromscratch.shop` is currently served by a Cloudflare Tunnel connector running on the operator's laptop, pointed at the **DEV** service. |
| Backups — schedules | **GO** | Applied today and read back: `course-db-volume`, `payments-db-volume` and `messages-db-volume` each carry DAILY (6 d retention), WEEKLY (27 d) and MONTHLY (89 d). Before today all ten Production volumes had none. |
| Backups — restore | **NO-GO** | No restore has been attempted against Production, and there is no owner named for the drill. A configured schedule is not a backup. |
| Backups — logical dumps | **NO-GO** | The brief asks for portable dumps stored outside the DB volume. `scripts/backup.sh` is 520 bytes of `docker compose exec … pg_dump` writing to a local directory: it was written for the Compose/Pi deployment and there is no `docker-compose.yml` and no host on Railway. Nothing fills this today. |
| Defence agents | **NO-GO** | `oracle` is `FAILED`. Its build log is one line, `scheduling build on Metal builder "builder-zthdex"` — same single line as in DEV, on a different builder. The candidate fix is in PR #2 and is not on `main`. |
| RabbitMQ credentials | **UNVERIFIED** | The variable and `AMQP_URL` were rotated and the service restarted, but RabbitMQ keeps its internal user in the volume, so the `app` user's password may still be the old one. `railway ssh` could not be used: the available key belongs to a different Railway workspace. Consumers have not been checked for AMQP auth errors. |

## What changed today

- Backup schedules created on the three Production database volumes and read back. This was the only item on the list that was actively losing safety every hour it stayed open: a volume loss would have been unrecoverable.
- The bucket proven functional end to end, which turns every bucket plan from an assumption into a fact.
- PR #2 opened, `dev` → `main`. It is what makes today's work reachable from Production at all, `oracle`'s build fix included.

## Corrections to the previous handoff

Its recommended order would cause harm at three points.

**Step 11 is done, and differently.** The handoff says the infrastructure repo has
no GitHub remote. It was published, and then moved at the owner's instruction: it
is now `infrastructure/` inside this repository, a plain folder, pushed on `dev`.
Creating another private repo would make a third copy of the same files.

**Do not upload `75f9fc8`.** That commit still decides the environment with
`ctx.isEnvironment("PROD")`, which is false against an environment named
`Production`, so it would ship exactly the misconfiguration described in PR #2.
The current IaC is in `infrastructure/.railway/railway.ts` on `dev`.

**Step 8 is mis-ordered.** Implementing an upload client is premature: the only
asset that exists is a 2.4 MB static PDF that is more correct inside the image —
immutable per deploy, no runtime credentials, and unservable without passing the
paywall check. The bucket's real first consumer is the logical database dump the
brief asks for, which is the row marked NO-GO above and has actual data-loss
consequences.

## What only the owner can do

1. Mercado Pago `MP_ACCESS_TOKEN` (`APP_USR-`), `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` — newly issued, because the previous values were pasted into a chat and must be treated as compromised.
2. A new `RESEND_API_KEY`, on a domain with SPF, DKIM and DMARC.
3. Merge PR #2, or say not to.
4. A Cloudflare API token for the account that owns `aifromscratch.shop` (`0d7ce2fb5340a4e778d2e9f1e6c1d838`). The token on this machine belongs to a different account and sees only `alpadev.xyz`, which is why the DNS cutover cannot proceed.
5. A decision on the billable inventory: three buckets where two are declared (`bundled-taco-LGCj` is an orphan) and five Redis-shaped volumes where one is (`cache-volume`, `redis-volume`, `redis-volume-IV7i`, `redis-volume-cVP2`, `redis-volume-Q5bh`).
6. A named owner for the restore drill.
