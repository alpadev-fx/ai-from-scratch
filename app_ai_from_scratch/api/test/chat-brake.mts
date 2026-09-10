// The test the ledger claimed existed for months.
//
// docs/MVP-READINESS.md cited `api/test/chat-brake.mts` as the evidence for
// "chat spend uncapped by tokens; client picks model". The file did not exist,
// and the token half of that ceiling did not work: the counters were compared
// after the billed call and the only consequence was a log line. Citing a test
// that is not there is worse than citing none — it stops anyone from looking.

import assert from 'node:assert/strict';
import { tokenCeiling } from '../src/chat-ceiling.ts';
import {
  chatBrake,
  chatDayKey,
  chatFreeDayKey,
  chatFreeGlobalKey,
  chatGlobalKey,
  leagueDay,
  minuteBucket,
  type ChatBrakeCaps,
  type ChatBrakeLog,
} from '../src/chat-brake.ts';

const CAPS = { own: 200_000, global: 5_000_000 };
const WAIT = 3600;

// Under both ceilings: the message goes through.
assert.equal(tokenCeiling(0, 0, CAPS, WAIT), null);
assert.equal(tokenCeiling(199_999, 4_999_999, CAPS, WAIT), null);

// EXACTLY at the ceiling still passes. The question caps use `>` too: a counter
// sitting on its allowance has spent it, not exceeded it. If this ever flips to
// `>=`, a user is refused one turn earlier than the number on screen promises.
assert.equal(tokenCeiling(200_000, 0, CAPS, WAIT), null);
assert.equal(tokenCeiling(0, 5_000_000, CAPS, WAIT), null);

// One token past the personal ceiling.
const own = tokenCeiling(200_001, 0, CAPS, WAIT);
assert.ok(own, 'a personal token overrun must be refused');
assert.equal(own.limite, 'tokens_dia');
assert.equal(own.tope, CAPS.own);
assert.equal(own.esperaS, WAIT);
assert.ok(own.msg.length > 0, 'the payload carries a message the client can show');

// One token past the platform ceiling.
const global = tokenCeiling(0, 5_000_001, CAPS, WAIT);
assert.ok(global, 'a platform token overrun must be refused');
assert.equal(global.limite, 'tokens_dia_global');
assert.equal(global.tope, CAPS.global);

// Both blown: the person is told it was THEIR budget, not the platform's.
// Telling someone the platform is full when they are the one who drained their
// own allowance sends them to support instead of to tomorrow.
const both = tokenCeiling(200_001, 5_000_001, CAPS, WAIT);
assert.ok(both);
assert.equal(both.limite, 'tokens_dia');

// The regression this file exists for: a run far past the ceiling — 120 turns
// at ~30 000 tokens, which the question cap alone permits — must not pass.
assert.ok(tokenCeiling(3_600_000, 0, CAPS, WAIT), 'the count cap alone is not a spend cap');

const now = 1_700_000_000_000;
const WINDOW_MS = 60_000;
const PER_MINUTE = 6;

const map = new Map<number, number[]>();
for (let i = 0; i < PER_MINUTE; i++) {
  const r = minuteBucket(1, PER_MINUTE, WINDOW_MS, map, now + i);
  assert.equal(r.ok, true, `hit ${i + 1} of ${PER_MINUTE} must pass`);
}
const seventh = minuteBucket(1, PER_MINUTE, WINDOW_MS, map, now + PER_MINUTE);
assert.equal(seventh.ok, false, 'the seventh hit in the window is refused');
assert.ok((seventh.esperaS ?? 0) >= 1);

const rolled = minuteBucket(1, PER_MINUTE, WINDOW_MS, map, now + WINDOW_MS + 1);
assert.equal(rolled.ok, true, 'entries older than WINDOW_MS stop counting');

const BRAKE_CAPS: ChatBrakeCaps = {
  perMinute: 100,
  dayCap: 3,
  globalDayCap: 5,
  dayCapFree: 2,
  globalDayCapFree: 3,
  tokensDay: 200_000,
  tokensDayGlobal: 5_000_000,
  windowMs: WINDOW_MS,
};

function fakeStore(seed: Record<string, number> = {}) {
  const counts = new Map<string, number>(Object.entries(seed));
  const increment = async (key: string, n = 1) => {
    const next = (counts.get(key) ?? 0) + n;
    counts.set(key, next);
    return next;
  };
  const readCounter = async (key: string) => counts.get(key) ?? 0;
  return { increment, readCounter, counts };
}

function silentLog(): ChatBrakeLog & { errors: unknown[] } {
  const errors: unknown[] = [];
  return {
    errors,
    error(obj, msg) { errors.push({ obj, msg }); },
  };
}

const day = leagueDay(now);
const minuteMap = () => new Map<number, number[]>();

{
  const { increment, readCounter } = fakeStore();
  const log = silentLog();
  const allowed = await chatBrake(7, false, increment, readCounter, log, BRAKE_CAPS, minuteMap(), now);
  assert.equal(allowed, null, 'under both day caps the message goes through');
}

{
  const { increment, readCounter } = fakeStore({ [chatDayKey(7, day)]: 3 });
  const log = silentLog();
  const hit = await chatBrake(7, false, increment, readCounter, log, BRAKE_CAPS, minuteMap(), now);
  assert.ok(hit, 'per-user day cap must refuse');
  assert.equal(hit.limite, 'dia');
  assert.equal(hit.tope, BRAKE_CAPS.dayCap);
}

{
  const { increment, readCounter } = fakeStore({ [chatGlobalKey(day)]: 5 });
  const log = silentLog();
  const hit = await chatBrake(8, false, increment, readCounter, log, BRAKE_CAPS, minuteMap(), now);
  assert.ok(hit, 'global day cap must refuse');
  assert.equal(hit.limite, 'dia_global');
  assert.equal(hit.tope, BRAKE_CAPS.globalDayCap);
  assert.equal(log.errors.length, 1);
}

{
  const { increment, readCounter } = fakeStore({ [chatFreeDayKey(9, day)]: 2 });
  const log = silentLog();
  const hit = await chatBrake(9, true, increment, readCounter, log, BRAKE_CAPS, minuteMap(), now);
  assert.ok(hit, 'free-tier per-user day cap must refuse');
  assert.equal(hit.limite, 'dia');
  assert.equal(hit.tope, BRAKE_CAPS.dayCapFree);
}

{
  const { increment, readCounter } = fakeStore({ [chatFreeGlobalKey(day)]: 3 });
  const log = silentLog();
  const hit = await chatBrake(10, true, increment, readCounter, log, BRAKE_CAPS, minuteMap(), now);
  assert.ok(hit, 'free-tier global day cap must refuse');
  assert.equal(hit.limite, 'dia_global');
  assert.equal(hit.tope, BRAKE_CAPS.globalDayCapFree);
}

{
  const increment = async () => { throw new Error('counter.bump failed'); };
  const readCounter = async () => 0;
  const log = silentLog();
  await assert.rejects(
    () => chatBrake(11, false, increment, readCounter, log, BRAKE_CAPS, minuteMap(), now),
    /counter\.bump failed/,
  );
  assert.equal(log.errors.length, 0, 'a thrown increment does not log; it rejects');
}

console.log('chat-brake: token ceiling, minuteBucket and chatBrake ok');
