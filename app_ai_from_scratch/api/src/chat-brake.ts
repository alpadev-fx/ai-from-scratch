/**
 * Per-minute and per-day chat question brakes, as pure functions.
 *
 * Lived inline in server.ts, which calls `app.listen` at import, so a test
 * that imported chatBrake booted Fastify, Postgres and the ai service. State
 * and clock are trailing injected parameters (same trade as brake.ts
 * countWindow). Postgres and logging are required parameters with no
 * defaults — defaulting them would pull jobs.ts into every test import.
 */
import { LEAGUE_ZONE } from './leagues.ts';
import { tokenCeiling } from './chat-ceiling.ts';

const FMT_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: LEAGUE_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const leagueDay = (now = Date.now()): string => FMT_DAY.format(new Date(now));
export const chatDayKey = (userId: number, day = leagueDay()): string => `chat:u${userId}:${day}`;
export const chatGlobalKey = (day = leagueDay()): string => `chat:global:${day}`;
export const chatFreeDayKey = (userId: number, day = leagueDay()): string => `chat:free:u${userId}:${day}`;
export const chatFreeGlobalKey = (day = leagueDay()): string => `chat:free:global:${day}`;
export const chatTokDayKey = (userId: number, day = leagueDay()): string => `chat:tok:u${userId}:${day}`;
export const chatTokGlobalKey = (day = leagueDay()): string => `chat:tok:global:${day}`;

/** Seconds until the day rolls over in LEAGUE_ZONE — the retry-after for a daily cap. */
export function secondsToMidnight(now = Date.now()): number {
  const p = Object.fromEntries(FMT_TIME.formatToParts(new Date(now))
    .filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)])) as Record<string, number>;
  return Math.max(1, 86400 - ((p.hour ?? 0) * 3600 + (p.minute ?? 0) * 60 + (p.second ?? 0)));
}

export const memoryMinuteWindows = new Map<number, number[]>();

export function minuteBucket(
  userId: number,
  limit: number,
  windowMs: number,
  map = memoryMinuteWindows,
  now = Date.now(),
): { ok: boolean; esperaS?: number } {
  const w = (map.get(userId) ?? []).filter((t) => now - t < windowMs);
  map.set(userId, w);
  if (w.length >= limit) {
    return { ok: false, esperaS: Math.max(1, Math.ceil((windowMs - (now - w[0]!)) / 1000)) };
  }
  w.push(now);
  if (map.size > 5000) {
    for (const [k, v] of map) if (!v.some((t) => now - t < windowMs)) map.delete(k);
  }
  return { ok: true };
}

/** The 429 payload. Keys read by web/src/lib/chat-client.ts. */
export interface Brake { limite: string; esperaS: number; tope: number; msg: string }

export interface ChatBrakeCaps {
  perMinute: number;
  dayCap: number;
  globalDayCap: number;
  dayCapFree: number;
  globalDayCapFree: number;
  tokensDay: number;
  tokensDayGlobal: number;
  windowMs: number;
}

export interface ChatBrakeLog {
  error: (obj: object, msg: string) => void;
}

export type IncrementFn = (key: string, n?: number) => Promise<number>;
export type ReadCounterFn = (key: string) => Promise<number>;

/**
 * Returns null when the message may proceed, or the 429 payload when it may not.
 *
 * The daily counters are INCREMENTED and then compared, in one atomic statement
 * each, so two simultaneous messages cannot both read 119 and both pass. A
 * rejected message still counts, deliberately: hammering the endpoint after the
 * ceiling must not be free.
 */
export async function chatBrake(
  userId: number,
  unpaid: boolean,
  increment: IncrementFn,
  readCounter: ReadCounterFn,
  log: ChatBrakeLog,
  caps: ChatBrakeCaps,
  map = memoryMinuteWindows,
  now = Date.now(),
): Promise<Brake | null> {
  const min = minuteBucket(userId, caps.perMinute, caps.windowMs, map, now);
  if (!min.ok) {
    return { limite: 'minuto', esperaS: min.esperaS ?? 1, tope: caps.perMinute,
             msg: 'Vas muy rápido. Espera un momento y vuelve a preguntar.' };
  }
  const day = leagueDay(now);
  const dayCap = unpaid ? caps.dayCapFree : caps.dayCap;
  const globalCap = unpaid ? caps.globalDayCapFree : caps.globalDayCap;
  const own = await increment(unpaid ? chatFreeDayKey(userId, day) : chatDayKey(userId, day));
  if (own > dayCap) {
    return { limite: 'dia', esperaS: secondsToMidnight(now), tope: dayCap,
             msg: 'Llegaste al tope de preguntas de hoy. Mañana se reinicia.' };
  }
  const global = await increment(unpaid ? chatFreeGlobalKey(day) : chatGlobalKey(day));
  if (global > globalCap) {
    log.error({ day, global, unpaid }, 'chat: platform-wide daily cap reached');
    return { limite: 'dia_global', esperaS: secondsToMidnight(now), tope: globalCap,
             msg: 'El chat alcanzó su tope de hoy para toda la plataforma. Vuelve mañana.' };
  }
  const tokOwn = await readCounter(chatTokDayKey(userId, day));
  const tokGlobal = await readCounter(chatTokGlobalKey(day));
  const tok = tokenCeiling(tokOwn, tokGlobal,
    { own: caps.tokensDay, global: caps.tokensDayGlobal }, secondsToMidnight(now));
  if (tok) {
    if (tok.limite === 'tokens_dia_global') {
      log.error({ day, tokGlobal }, 'chat: platform-wide token cap reached');
    }
    return tok;
  }
  return null;
}
