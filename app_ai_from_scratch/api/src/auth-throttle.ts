/**
 * Auth-route sliding-window throttle, as a pure decision.
 *
 * Lived as an inline onRequest hook in server.ts, which calls app.listen at
 * import, so a test that imported the hook booted Fastify. State and clock
 * are trailing injected parameters (same trade as brake.ts countWindow).
 * The default map is the shared memoryBrakeCounters — keys are prefixed
 * `auth`, so they do not collide with other users of that map.
 */
import {
  countWindow,
  memoryBrakeCounters,
  slidingWindowKey,
  type BrakeResult,
} from './brake.ts';

export const AUTH_LIMITS: Record<string, number> = {
  '/api/auth/login': 10,
  '/api/auth/register': 5,
  '/api/auth/recover': 5,
  '/api/auth/reset': 5,
  '/api/account/delete': 5,
};

export const AUTH_WINDOW_MS = 60_000;

export function authThrottle(
  method: string,
  url: string,
  ip: string,
  map = memoryBrakeCounters,
  now = Date.now(),
): BrakeResult {
  if (method !== 'POST') return { ok: true, retryAfterS: 0, total: 0 };
  const path = url.split('?')[0]!.replace(/^\/api\/v\d+\//, '/api/');
  const limit = AUTH_LIMITS[path];
  if (limit === undefined) return { ok: true, retryAfterS: 0, total: 0 };
  return countWindow(
    slidingWindowKey('auth', `${path}:${ip}`, AUTH_WINDOW_MS, now),
    limit,
    AUTH_WINDOW_MS,
    map,
    now,
  );
}
