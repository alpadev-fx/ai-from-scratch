/**
 * Sign in with Google, as decisions that can be tested without a network.
 *
 * Everything here is a pure function on purpose: the dangerous part of OAuth is
 * not the HTTP, it is deciding WHICH account a token opens. That decision is
 * `decidirCuenta` below and it has its own test; the routes in index.ts only
 * carry it out.
 *
 * TWO RULES THAT ARE NOT NEGOTIABLE HERE:
 *
 * 1. `email_verified` must be true. `users.email` is UNIQUE, so an identity
 *    arriving with an address that already exists can only ever be linked to
 *    that row. If the address were not proven, anyone able to mint a token
 *    carrying a victim's address would walk into the victim's account without
 *    knowing the password. Google sends unverified addresses for some Workspace
 *    setups, so this is a real case, not a hypothetical one.
 *
 * 2. Nothing has a default. No default client id, no default secret, no default
 *    redirect. `configGoogle` returns null when anything is missing and the
 *    routes answer 503 — the house rule is fail closed, and a half-configured
 *    OAuth client is how you end up trusting tokens minted for someone else's
 *    application.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const GOOGLE_AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_EMISORES = ['https://accounts.google.com', 'accounts.google.com'];

/** Cookie que guarda el estado del viaje de ida. Corta vida, propia del flujo. */
export const COOKIE_ESTADO = 'goauth';
export const ESTADO_MINUTOS = 10;

export interface ConfigGoogle {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * La configuración, o null si falta cualquier pieza.
 *
 * Devolver algo a medias sería peor que no devolver nada: con un redirect_uri
 * equivocado el código de autorización viaja a otro sitio.
 */
export function configGoogle(env: NodeJS.ProcessEnv = process.env): ConfigGoogle | null {
  const clientId = String(env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const redirectUri = String(env.GOOGLE_REDIRECT_URI ?? '').trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export interface EstadoViaje {
  /** Aleatorio, es lo que se compara al volver. */
  nonce: string;
  /** El usuario aceptó las condiciones antes de salir hacia Google. */
  acepta: boolean;
  /** Momento de emisión, en milisegundos. */
  t: number;
}

export const nuevoNonce = (): string => randomBytes(24).toString('base64url');

/**
 * El estado viaja firmado dentro de una cookie propia, no en memoria del
 * proceso: el api corre en más de una instancia y la vuelta de Google puede
 * caer en otra. Se firma con el mismo secreto de sesión para que el valor no se
 * pueda fabricar desde fuera.
 */
export function firmarEstado(estado: EstadoViaje, firmar: (data: string) => string): string {
  const cuerpo = Buffer.from(JSON.stringify(estado)).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function leerEstado(
  valor: unknown,
  firmar: (data: string) => string,
  ahora = Date.now(),
): EstadoViaje | null {
  const partes = String(valor ?? '').split('.');
  if (partes.length !== 2) return null;
  const [cuerpo, firma] = partes as [string, string];
  const esperada = firmar(cuerpo);
  // Tiempo constante: comparar firmas con === filtra el prefijo correcto byte a
  // byte, que es la forma clásica de adivinar una firma a base de intentos.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const estado = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as EstadoViaje;
    if (typeof estado?.nonce !== 'string' || typeof estado?.t !== 'number') return null;
    if (ahora - estado.t > ESTADO_MINUTOS * 60_000) return null;   // caducado
    return { nonce: estado.nonce, acepta: estado.acepta === true, t: estado.t };
  } catch {
    return null;
  }
}

export function urlAutorizacion(cfg: ConfigGoogle, estadoFirmado: string, nonce: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: estadoFirmado,
    nonce,
    // `select_account` y no `none`: si la persona tiene varias cuentas, entrar
    // con la que Google tenga activa por casualidad es como entrar con otra
    // identidad sin enterarse.
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTORIZAR}?${p.toString()}`;
}

export interface ClaimsGoogle {
  iss?: unknown; aud?: unknown; exp?: unknown; sub?: unknown;
  email?: unknown; email_verified?: unknown; name?: unknown; nonce?: unknown;
}

export interface IdentidadGoogle { sub: string; email: string; nombre: string }

/**
 * Lee el id_token SIN comprobar su firma, y eso es correcto AQUÍ y solo aquí:
 * este token no llega por el navegador, llega de una respuesta directa del
 * endpoint de token de Google sobre TLS, autenticada con el client_secret. Es
 * el propio Google quien acaba de entregarlo por un canal cerrado. Un token que
 * llegara por el navegador SÍ exigiría verificar la firma contra el JWKS.
 */
export function leerIdToken(idToken: unknown): ClaimsGoogle | null {
  const partes = String(idToken ?? '').split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1]!, 'base64url').toString()) as ClaimsGoogle;
  } catch {
    return null;
  }
}

export type FalloIdentidad =
  | 'token_ilegible' | 'emisor' | 'audiencia' | 'caducado' | 'nonce' | 'sin_sujeto'
  | 'sin_correo' | 'correo_sin_verificar';

/**
 * Convierte los claims en una identidad utilizable, o dice exactamente por qué
 * no. Cada comprobación existe porque sin ella el token de otra aplicación, o
 * de otra persona, abriría una cuenta de aquí.
 */
export function identidadDe(
  claims: ClaimsGoogle | null,
  cfg: Pick<ConfigGoogle, 'clientId'>,
  nonceEsperado: string,
  ahora = Date.now(),
): { ok: true; identidad: IdentidadGoogle } | { ok: false; error: FalloIdentidad } {
  if (!claims) return { ok: false, error: 'token_ilegible' };
  if (!GOOGLE_EMISORES.includes(String(claims.iss))) return { ok: false, error: 'emisor' };
  // `aud` distinto de nuestro client_id = token emitido para OTRA aplicación.
  // Aceptarlo convierte cualquier app de Google en una puerta a estas cuentas.
  if (String(claims.aud) !== cfg.clientId) return { ok: false, error: 'audiencia' };
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= ahora) return { ok: false, error: 'caducado' };
  if (String(claims.nonce ?? '') !== nonceEsperado) return { ok: false, error: 'nonce' };
  const sub = String(claims.sub ?? '').trim();
  if (!sub) return { ok: false, error: 'sin_sujeto' };
  const email = String(claims.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'sin_correo' };
  if (claims.email_verified !== true) return { ok: false, error: 'correo_sin_verificar' };
  const nombre = String(claims.name ?? '').trim() || email.split('@')[0]!;
  return { ok: true, identidad: { sub, email, nombre } };
}

export type Decision =
  | { accion: 'entrar'; userId: number }
  | { accion: 'vincular'; userId: number }
  | { accion: 'crear' }
  | { accion: 'falta_consentimiento' }
  | { accion: 'conflicto_sujeto'; userId: number };

/**
 * LA DECISIÓN. Qué cuenta abre esta identidad.
 *
 * - Si el `sub` ya está guardado, es esa cuenta y no se mira el correo: el
 *   correo de una cuenta de Google puede cambiar, el `sub` no.
 * - Si no, y el correo (ya probado) existe aquí, se vincula a esa cuenta. No
 *   hay alternativa: `users.email` es UNIQUE, así que o se vincula o no se
 *   puede entrar nunca con ese correo.
 * - Si esa fila ya tiene OTRO `sub` guardado, no se toca. Dos identidades de
 *   Google sobre la misma cuenta es una señal de que algo va mal, y sobrescribir
 *   el vínculo sería regalar la cuenta a la segunda.
 * - Si no existe nada, se crea, pero solo con consentimiento explícito: el
 *   registro por contraseña exige `acepta === true` y guarda consent_at, así que
 *   una cuenta nacida por Google no puede saltarse eso.
 */
export function decidirCuenta(entrada: {
  porGoogle: { id: number } | null;
  porEmail: { id: number; google_sub?: string | null } | null;
  sub: string;
  acepta: boolean;
}): Decision {
  if (entrada.porGoogle) return { accion: 'entrar', userId: entrada.porGoogle.id };
  if (entrada.porEmail) {
    const yaVinculada = String(entrada.porEmail.google_sub ?? '').trim();
    if (yaVinculada && yaVinculada !== entrada.sub) {
      return { accion: 'conflicto_sujeto', userId: entrada.porEmail.id };
    }
    return { accion: 'vincular', userId: entrada.porEmail.id };
  }
  if (!entrada.acepta) return { accion: 'falta_consentimiento' };
  return { accion: 'crear' };
}

/**
 * La contraseña de una cuenta creada por Google.
 *
 * NO se deja `pass_hash` a NULL, y no es pereza: la columna es NOT NULL y, más
 * importante, cuatro sitios asumen que hay un hash — el login, el borrado de
 * cuenta, el reset y el señuelo de tiempo constante que hace que «no existe esa
 * cuenta» cueste lo mismo que «contraseña incorrecta». Un NULL los rompe todos.
 * Aquí se guarda el hash de 32 bytes aleatorios que nadie ve nunca: ninguna
 * contraseña lo abre, y quien quiera una la pone por «recuperar contraseña»,
 * que ya existe y llega por correo probado.
 */
export const claveInservible = (): string => randomBytes(32).toString('base64url');
