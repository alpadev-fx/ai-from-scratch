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
  // NO es una ruta de auth, y aun asi va aqui: este mapa es el unico freno por
  // IP que existe, y un endpoint que cambia un token de tarjeta por un cargo es
  // el blanco clasico de prueba de tarjetas robadas. El atacante tokeniza en el
  // navegador (la clave publica lo es por definicion) y machaca la ruta para ver
  // cuales responden `approved`. Cada intento es una autorizacion real contra el
  // adquirente, en la cuenta del comercio: eso son multas y suspension.
  //
  // 5 por minuto por IP. Un comprador de verdad necesita uno, o tres si se
  // equivoca con el CVV. Por IP no para un ataque repartido entre muchas: para
  // eso hace falta contar tambien por usuario, y eso todavia no esta.
  '/api/payments/mercadopago/card': 5,
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
