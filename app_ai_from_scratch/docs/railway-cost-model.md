# Railway cost model

Railway Pro includes a monthly usage allowance and meters excess usage. Current
reference prices are about $20/vCPU-month, $10/GB RAM-month, $0.15/GB volume,
$0.05/GB service egress and $0.015/GB-month bucket storage. Use Railway usage
data for actual billing. Record DEV and PROD separately by service, CPU/RAM
minutes, volumes, bucket GB and egress. Model 100 through 100,000 registered
users only after measured active/concurrent profiles exist. Scale API at
sustained CPU >60% or p95 regression, workers at queue age/depth, and review
PgBouncer above 70% connection use. DEV may sleep stateless services; PROD does
not sleep request or payment paths.
