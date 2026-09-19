#!/bin/sh
# PROD sentinel for aifromscratch.shop — AI-14.
#
# One invocation = one probe cycle, then exit. Scheduling belongs to launchd
# (scripts/sentinel.plist), not to a while-loop in here: a crashed loop is a
# silent monitor, and a silent monitor is exactly how the 2026-09-07 outage ran
# for three days.
#
# House rule: a check that cannot run counts as FAILED, not skipped. A curl that
# cannot connect reports code 000, and 000 is a failure.
#
# Exit code is the contract: 0 = OK or HEALED. 1 = anything else.
set -eu

PUBLIC_BASE=${SENTINEL_PUBLIC_BASE:-https://aifromscratch.shop}
WEB_ORIGIN=${SENTINEL_WEB_ORIGIN:-https://web-production-486c3.up.railway.app}
API_ORIGIN=${SENTINEL_API_ORIGIN:-https://api-production-ed82c.up.railway.app}
LOG_DIR=${SENTINEL_LOG_DIR:-/Users/alpadev/Library/Logs/aifromscratch}
BRIDGE_CFG=${SENTINEL_BRIDGE_CFG:-/Users/alpadev/Desktop/course/.swarm/tunnel-bridge.yml}
CLOUDFLARED=${SENTINEL_CLOUDFLARED:-/opt/homebrew/bin/cloudflared}
TUNNEL_ID=2dba40db-65ea-41ee-a493-96034f19a1d1

mkdir -p "$LOG_DIR"
EVENTS="$LOG_DIR/sentinel.jsonl"
LAST_ALERT="$LOG_DIR/.last_alert"

# curl writes the status code on stdout. A connect failure yields 000, which is
# a legitimate result here, so the || guards the exit status, not the value.
probe() {
  # curl already prints 000 on a connect failure AND exits non-zero, so the
  # fallback must only cover the case where it printed nothing at all.
  # Appending unconditionally produced "000000" in the log.
  _c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null) || true
  [ -n "$_c" ] || _c=000
  printf '%s' "$_c"
}

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Both sinks are attempted. An unset webhook is a deliberate skip; a set webhook
# that fails to POST is logged, never swallowed.
alert() {
  _title=$1
  _body=$2
  _payload=$3
  osascript -e "display notification \"$_body\" with title \"PROD SENTINEL\" subtitle \"$_title\"" >/dev/null 2>&1 \
    || echo "sentinel: osascript notification failed" >&2
  if [ -n "${SENTINEL_WEBHOOK_URL:-}" ]; then
    printf '%s' "$_payload" | curl -sS --max-time 10 -X POST \
      -H 'content-type: application/json' -d @- "$SENTINEL_WEBHOOK_URL" >/dev/null \
      || echo "sentinel: webhook POST failed to $SENTINEL_WEBHOOK_URL" >&2
  fi
}

c_public_home=$(probe "$PUBLIC_BASE/")
c_public_api=$(probe "$PUBLIC_BASE/api/health")
c_origin_home=$(probe "$WEB_ORIGIN/")
c_origin_api=$(probe "$API_ORIGIN/api/health")

public_ok=1;  [ "$c_public_home" = 200 ] && [ "$c_public_api" = 200 ] && public_ok=0
origin_ok=1;  [ "$c_origin_home" = 200 ] && [ "$c_origin_api" = 200 ] && origin_ok=0

healed=false
if [ "$public_ok" -eq 0 ] && [ "$origin_ok" -eq 0 ]; then
  class=OK;       reason=none;              outcome=OK
elif [ "$public_ok" -ne 0 ] && [ "$origin_ok" -eq 0 ]; then
  class=EDGE;     reason=public_down_origin_up; outcome=PENDING
elif [ "$public_ok" -ne 0 ] && [ "$origin_ok" -ne 0 ]; then
  class=ORIGIN;   reason=origin_down;       outcome=ESCALATE_ORIGIN
else
  class=DEGRADED; reason=origin_down_edge_serving; outcome=ESCALATE_ORIGIN
fi

# 530 is Cloudflare error 1033: the hostname routes to a named tunnel that has
# zero registered connectors. Naming it explicitly is an acceptance criterion.
[ "$c_public_home" = 530 ] && reason=CF_1033_NO_CONNECTOR

# Auto-heal is scoped to EDGE and to exactly one attempt per cycle.
if [ "$class" = EDGE ]; then
  if pgrep -f 'cloudflared.*tunnel-bridge' >/dev/null 2>&1; then
    # A live connector plus a failing public URL means the DNS record no longer
    # resolves to this tunnel. Restarting the connector cannot fix that and
    # killing it would drop whatever still works.
    outcome=ESCALATE_DNS
    reason="$reason;dns_no_longer_points_at_$TUNNEL_ID"
  else
    nohup "$CLOUDFLARED" --config "$BRIDGE_CFG" tunnel run >>"$LOG_DIR/cloudflared.log" 2>&1 &
    sleep 20
    if [ "$(probe "$PUBLIC_BASE/")" = 200 ]; then
      outcome=HEALED; healed=true
    else
      outcome=HEAL_FAILED
    fi
  fi
fi

payload=$(printf '{"ts":"%s","class":"%s","reason":"%s","outcome":"%s","codes":{"public_home":"%s","public_api":"%s","origin_home":"%s","origin_api":"%s"},"healed":%s}' \
  "$(now)" "$class" "$reason" "$outcome" \
  "$c_public_home" "$c_public_api" "$c_origin_home" "$c_origin_api" "$healed")
printf '%s\n' "$payload" >>"$EVENTS"
printf '%s\n' "$payload"

key="$class:$reason"
prev=""
[ -f "$LAST_ALERT" ] && prev=$(cat "$LAST_ALERT")

if [ "$class" = OK ]; then
  # One RECOVERED alert on the first OK cycle after a bad one, then silence.
  if [ -n "$prev" ]; then
    alert "RECOVERED" "$PUBLIC_BASE is serving 200 again" "$payload"
    rm -f "$LAST_ALERT"
  fi
  exit 0
fi

# De-duplicate: same class+reason as last cycle does not re-alert.
if [ "$key" != "$prev" ]; then
  alert "$class / $outcome" "$PUBLIC_BASE home=$c_public_home api=$c_public_api | origin home=$c_origin_home api=$c_origin_api" "$payload"
  printf '%s' "$key" >"$LAST_ALERT"
fi

[ "$outcome" = HEALED ] && exit 0
exit 1
