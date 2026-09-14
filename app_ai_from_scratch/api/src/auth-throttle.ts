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
  // Cotizar es gratis y sin efectos, pero adivinar codigos de cupon tambien:
  // sin freno son 1000 intentos/min contra una tabla de 25 cupos al 95%.
  '/api/payments/cupon/cotizar': 12,
};

/**
 * Rutas que se frenan aunque sean GET.
 *
 * El mapa de arriba solo cuenta POST, y eso deja fuera el inicio del flujo de
 * Google, que es un GET. Sin freno, cualquiera puede pedir esa ruta en bucle:
 * la ida solo firma una cookie y redirige (barato), pero la vuelta con un
 * `code` cualquiera hace que ESTE servidor llame al endpoint de token de
 * Google. Eso convierte una petición ajena en una petición saliente nuestra, y
 * un amplificador así se paga con la cuota y la reputación del cliente OAuth.
 *
 * Va en un mapa aparte a propósito: mezclarlo con AUTH_LIMITS rompería la regla
 * que dice que un método distinto de POST no consume cupo, y esa regla está
 * pinchada en api/test/auth-throttle.mts porque protege al resto de rutas.
 */
export const AUTH_LIMITS_GET: Record<string, number> = {
  '/api/auth/google': 20,
  '/api/auth/google/callback': 20,
};

export const AUTH_WINDOW_MS = 60_000;

export function authThrottle(
  method: string,
  url: string,
  ip: string,
  map = memoryBrakeCounters,
  now = Date.now(),
): BrakeResult {
  const path = url.split('?')[0]!.replace(/^\/api\/v\d+\//, '/api/');
  if (method !== 'POST') {
    const limitGet = method === 'GET' ? AUTH_LIMITS_GET[path] : undefined;
    if (limitGet === undefined) return { ok: true, retryAfterS: 0, total: 0 };
    return countWindow(
      slidingWindowKey('auth', `${path}:${ip}`, AUTH_WINDOW_MS, now),
      limitGet, AUTH_WINDOW_MS, map, now,
    );
  }
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
