# PROD Sentinel (AI-14)

Detects customer-visible outages of `aifromscratch.shop`, heals the one failure
mode it is safe to heal, and refuses to touch the ones it isn't.

Files: `scripts/sentinel.sh`, `scripts/sentinel.plist`.

## Why it exists

The 2026-09-07 outage ran for ~3 days with **zero alerts**. Railway served HTTP
200 the entire time. The failure was one Cloudflare-proxied hostname routed to
named tunnel `2dba40db-65ea-41ee-a493-96034f19a1d1`, which had zero registered
connectors — Cloudflare error 1033 / HTTP 530. Any monitor pointed at the origin
would have reported green through the whole incident. **The primary probe must
hit the public domain.**

## What it probes

| id | URL | pass |
|---|---|---|
| `public_home` | `https://aifromscratch.shop/` | 200 |
| `public_api`  | `https://aifromscratch.shop/api/health` | 200 |
| `origin_home` | `https://web-production-486c3.up.railway.app/` | 200 |
| `origin_api`  | `https://api-production-ed82c.up.railway.app/api/health` | 200 |

Note the api origin path is `/api/health`. Bare `/health` and `/healthz` return
**404** on that service — verified 2026-09-11. Getting this wrong makes the
sentinel scream DEGRADED at a perfectly healthy platform.

A curl that cannot connect yields `000`, and `000` is a FAILURE, never a skip.

## Classification

| public | origin | class | meaning |
|---|---|---|---|
| pass | pass | `OK` | — |
| fail | pass | `EDGE` | DNS / Cloudflare / dead tunnel |
| fail | fail | `ORIGIN` | the application is actually down |
| pass | fail | `DEGRADED` | edge serving, origin partially down |

If `public_home` is exactly `530`, the reason is recorded as
`CF_1033_NO_CONNECTOR` — the signature of the incident above.

## What it heals, and what it refuses to

**Heals — `EDGE` with no connector running.** Starts the bridge connector from
`.swarm/tunnel-bridge.yml`, waits 20s, re-probes once. Back to 200 → `HEALED`.
Still failing → `HEAL_FAILED`. One attempt per cycle, never more.

**Refuses — `EDGE` with a connector already running.** Outcome `ESCALATE_DNS`.
A live connector plus a failing public URL means the DNS record no longer points
at this tunnel. Restarting the connector cannot fix that, and killing it would
drop whatever still works. This needs Cloudflare API access on the account that
owns the `aifromscratch.shop` zone (see AI-6).

**Refuses — `ORIGIN` / `DEGRADED`.** Outcome `ESCALATE_ORIGIN`, alert, exit 1.
It does **not** auto-redeploy. An automatic redeploy on top of a bad commit turns
a five-minute outage into an hour.

## Alerts

Fire only when `class != OK`, de-duplicated on `class:reason` via
`$LOG_DIR/.last_alert`. One `RECOVERED` alert on the first `OK` cycle after a bad
one, then silence.

Two sinks, both attempted: a macOS notification, and — if `SENTINEL_WEBHOOK_URL`
is set — a JSON POST. An unset webhook is a deliberate skip; a set webhook that
fails to POST is logged to stderr, never swallowed.

## Logs

`/Users/alpadev/Library/Logs/aifromscratch/` — `sentinel.jsonl` (one JSON object
per cycle), `cloudflared.log`, `sentinel.out.log`, `sentinel.err.log`.
Override with `SENTINEL_LOG_DIR`.

## Install / uninstall

```sh
launchctl bootstrap gui/$(id -u) /Users/alpadev/Desktop/course/AIFromScratch/app_ai_from_scratch/scripts/sentinel.plist
launchctl print     gui/$(id -u)/shop.aifromscratch.sentinel | head -20
launchctl kickstart -p gui/$(id -u)/shop.aifromscratch.sentinel   # run one cycle now
launchctl bootout   gui/$(id -u)/shop.aifromscratch.sentinel      # remove
```

Interval: 120s. Worst case ~2 min of customer-visible downtime before the heal
attempt begins.

## Controlled failure test (acceptance criterion 8)

```sh
SENTINEL_PUBLIC_BASE=https://definitely-not-real-aifs.invalid sh scripts/sentinel.sh
```

Expected: `class:EDGE`, `outcome:ESCALATE_DNS` while a connector is running,
exit 1, an alert, and the running connector's PID **unchanged**. Verified
2026-09-11.

## KNOWN GAP — acceptance criterion 6 is NOT met

This sentinel runs on the same Mac that currently hosts the bridge connector.
If that machine sleeps, loses network, or dies, the site goes down **and** the
monitor goes down with it, silently — the precise shape of the original
incident. Criterion 6 ("monitoring functional independently of production") is
not satisfied until either:

1. an off-box monitor (UptimeRobot / BetterStack / Healthchecks.io) probes
   `https://aifromscratch.shop/` and `/api/health` from outside, **or**
2. AI-6 lands: DNS cut over to Railway directly, the tunnel deleted, and this
   Mac removed from the production path entirely.

Until then this is detection-plus-self-heal for a laptop-shaped single point of
failure. Useful, not sufficient. Do not close AI-14 on this alone.
