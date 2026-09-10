# Capacity report

## DEV sanity run — 2026-09-09

Target: `web-dev-a8ad.up.railway.app`. The test ramped from 10 to 100 virtual
users over 60 seconds and back to zero over 30 seconds. Each iteration requested
`/`, `/registro`, `/login`, and `/api/health`. Payments and AI were not invoked.

| Metric | Observed |
| --- | ---: |
| Maximum virtual users | 100 |
| Requests | 9,772 |
| Average throughput | 107.52 requests/s |
| Failed HTTP requests | 0 / 9,772 (0.00%) |
| Average latency | 233.13 ms |
| Median latency | 129.96 ms |
| p90 latency | 415.73 ms |
| p95 latency | 565.51 ms |
| Maximum latency | 3.07 s |

Both configured thresholds passed: error rate below 1% and p95 below one
second. No HTTP bottleneck was found at or below 100 VUs for these anonymous
routes. This is a sanity result, not a supported-user claim: CPU, RAM, database
connections, queue depth, authenticated flows, writes, AI, payments and p99 were
not captured in this run.

## Remaining stages

Run measured stages at 250, 500 and 1,000 VUs only after observing Railway CPU,
RAM, database connections/latency, Redis usage, queue depth and worker
utilization during the run. Stop over 1% errors, 1s deterministic p95, or 85%
memory/connections. Report the first bottleneck and largest passing stage; do
not convert VUs into registered-user counts.
