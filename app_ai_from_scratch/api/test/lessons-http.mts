// Every lesson, over HTTP, the way a student meets it.
//
// api/test/lessons.mts proves the authored course is coherent with no database
// in the room. This one proves the route actually serves it: the card and the
// prose in both languages, three labs that can be failed and then solved, the
// attempt counter the page prints under each one, the quiz and its score, and
// the paywall that separates lesson 01 from the other eleven.
//
// The two halves catch different things. A lab can grade perfectly in-process
// and still be unreachable because the row never made it past the ontology, or
// because the payload the browser gets is not the payload the grader assumed.
// That gap is where "the seed writes `solution`, the route reads
// `solution_for_grading`" lives, and only a real request crosses it.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { run, pool } from '../src/db.ts';
import { REAL, storedPayload, storedSolution } from '../src/labs.ts';
import type { LabSeed } from '../src/labs.ts';
import { QUESTIONS } from '../src/quizzes.ts';
import { LESSON_CONTENT } from '../src/content.ts';
import { LESSON_GRADES, lessonCode, rankCode } from '../src/achievements.ts';

const port = await new Promise<number>((resolve, reject) => {
  const s = createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const a = s.address();
    if (!a || typeof a === 'string') return reject(new Error('no port'));
    const p = a.port; s.close(() => resolve(p));
  });
});
process.env.PORT = String(port); process.env.HOST = '127.0.0.1';
const API = `http://127.0.0.1:${port}`;
await import('../src/server.ts');
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${API}/api/version`)).ok) break; } catch { /* still booting */ }
  await new Promise((r) => setTimeout(r, 250));
}
assert.equal((await fetch(`${API}/api/version`)).ok, true, 'API must answer over HTTP');

const cookie = (r: Response): string =>
  (r.headers.getSetCookie?.() ?? []).map((x) => /(?:^|;\s*)sid=([^;]+)/.exec(x)?.[1]).find(Boolean) ?? '';
const req = (path: string, init: RequestInit = {}, sid = '') =>
  fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(sid ? { cookie: `sid=${sid}` } : {}) } });
const post = (path: string, payload: unknown, sid: string) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, sid);
const body = (r: Response): Promise<Record<string, any>> => r.json() as Promise<Record<string, any>>;

const suffix = randomBytes(10).toString('hex');
const register = async (label: string) => {
  const password = `Safe-${randomBytes(12).toString('base64url')}`;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const r = await post('/api/v3/auth/register',
    { email: `${slug}-${suffix}@example.test`, name: label, password, acepta: true }, '');
  assert.equal(r.status, 201, `register ${label}`);
  const sid = cookie(r);
  assert.ok(sid.length > 20, `register ${label}: no session`);
  return { sid, id: (await body(r)).user.id as number };
};

const paid = await register('Lesson student');
const free = await register('Lesson visitor');
await run('UPDATE users SET paid = 1 WHERE id = ?', [paid.id]);

// ---------------------------------------------------------------------------
// The answers a student can actually produce in the browser.
//
// Built from the SAME module the seed wrote from, so "the authored answer" and
// "the row being graded" cannot drift apart without this failing.

const sol = (r: LabSeed) => JSON.parse(JSON.stringify(storedSolution(r))) as Record<string, any>;

function rightAnswer(id: string): unknown {
  const r = REAL[id]!;
  const s = sol(r);
  switch (r.kind) {
    case 'choice': return s.value;
    case 'order': return s.order;
    case 'cut': return s.cuts;
    case 'knob': return Math.round((Number(s.min) + Number(s.max)) / 2);
    case 'hotcold': return s.value;
    case 'build': {
      const out: Record<number, string> = {};
      (s.slots as unknown[]).forEach((_slot, i) => { out[i] = s.accept[i][0]; });
      return out;
    }
    default: throw new Error(`${id}: no right answer for '${r.kind}'`);
  }
}

/** A wrong answer a student can reach by clicking, never a malformed body. */
function wrongAnswer(id: string): unknown {
  const r = REAL[id]!;
  const s = sol(r);
  const p = r.payload as Record<string, any>;
  switch (r.kind) {
    case 'choice': {
      const options = (storedPayload(id, r) as { options: string[] }).options;
      return options.find((o) => o !== String(s.value))!;
    }
    case 'order': return [...(s.order as string[])].reverse();
    case 'cut': return [];
    case 'knob': return Number(s.max) + 1 <= Number(p.max) ? Number(s.max) + 1 : Number(s.min) - 1;
    case 'hotcold': return Number(s.value) === Number(p.max) ? Number(s.value) - 1 : Number(s.value) + 1;
    case 'build': {
      const right = rightAnswer(id) as Record<number, string>;
      // A decoy if the lab has one — that is the wrong answer the lab is ABOUT.
      // Otherwise the only wrong answer its pool can express: a slot left empty.
      for (const [slot, texts] of Object.entries(r.decoy ?? {})) {
        return { ...right, [Number(slot)]: texts[0]! };
      }
      const last = (s.slots as unknown[]).length - 1;
      const gap = { ...right };
      delete gap[last];
      return gap;
    }
    default: throw new Error(`${id}: no wrong answer for '${r.kind}'`);
  }
}

// ---------------------------------------------------------------------------
// 1 · the paywall, which decides whether any of the rest is reachable

assert.equal((await req('/api/lessons/1')).status, 401, 'a lesson needs a session');
const freeOne = await req('/api/lessons/1', {}, free.sid);
assert.equal(freeOne.status, 200, 'lesson 01 is free');
assert.equal((await body(freeOne)).labs.length, 3, 'the free lesson still carries its three labs');
const freeTwo = await req('/api/lessons/2', {}, free.sid);
assert.equal(freeTwo.status, 402, 'lesson 02 is behind the wall');
const shopWindow = await body(freeTwo);
assert.equal(shopWindow.error, 'requiere_compra');
assert.ok(shopWindow.lesson?.title, '402 carries the lesson card: a locked page is a shop window');
assert.equal(JSON.stringify(shopWindow).includes('prompt'), false, '402 must not leak the lab prompts');
const blocked = await post('/api/labs/2.1/attempt', { answer: rightAnswer('2.1') }, free.sid);
assert.equal(blocked.status, 402, 'a locked lab refuses the attempt, not just the page');
assert.equal((await req('/api/lessons/13', {}, paid.sid)).status, 404, 'there is no lesson 13');
assert.equal((await req('/api/lessons/0', {}, paid.sid)).status, 404, 'there is no lesson 0');

// ---------------------------------------------------------------------------
// 2 · every lesson, in order, the way it is taken

let solvedLabs = 0;
let firstRank: string | null = null;

for (let n = 1; n <= 12; n++) {
  const L = `lesson ${n}`;

  // -- the page, in Spanish --------------------------------------------------
  const res = await req(`/api/lessons/${n}?lang=es`, {}, paid.sid);
  assert.equal(res.status, 200, `${L}: not served`);
  const page = await body(res);
  assert.equal(JSON.stringify(page).includes('"solution"'), false, `${L}: the page carries a solution`);
  assert.equal(page.lesson.n, n, `${L}: served the wrong lesson`);
  for (const field of ['eyebrow', 'title', 'summary', 'math', 'math_cap']) {
    assert.ok(page.lesson[field], `${L}: card.${field} came back empty`);
  }
  assert.equal(page.textoIdioma, 'es', `${L}: no Spanish teaching text`);
  assert.ok(page.texto.technical && page.texto.analogy, `${L}: the teaching text is incomplete`);
  assert.equal(page.texto.examples.length, 2, `${L}: the two worked examples did not survive the round trip`);
  for (const e of page.texto.examples) {
    // The exact predicate scenes/index.ts#isExample applies before mounting.
    for (const field of ['titulo', 'entrada', 'salida', 'nota']) {
      assert.ok(typeof e[field] === 'string' && e[field].trim(), `${L}: example.${field} is blank — no scene`);
    }
  }
  assert.equal(page.labs.length, 3, `${L}: does not have three labs`);
  assert.equal(page.labs.some((l: { draft: boolean }) => l.draft), false, `${L}: ships a draft lab`);
  assert.equal(page.quiz.length, 3, `${L}: does not have three quiz questions`);
  assert.deepEqual(page.quizScore, { correct: 0, total: 3, passed: false, passAt: 3 },
    `${L}: a fresh quiz does not start at zero`);

  // -- the same page, in English ---------------------------------------------
  const enRes = await req(`/api/lessons/${n}?lang=en`, {}, paid.sid);
  assert.equal(enRes.status, 200, `${L}: not served in English`);
  const enPage = await body(enRes);
  assert.equal(enPage.textoIdioma, 'en', `${L}: falls back to Spanish prose in English`);
  assert.equal(enPage.texto.technical, LESSON_CONTENT[n]!.en!.technical, `${L}: wrong English prose`);
  assert.notEqual(enPage.lesson.title, page.lesson.title, `${L}: the English card was never authored`);
  for (const [i, q] of enPage.quiz.entries()) {
    const authored = QUESTIONS.find((x) => x.id === q.id)!;
    assert.equal(q.prompt, authored.prompt_en, `${L}: quiz ${i + 1} prompt is not English`);
    for (const o of q.options) {
      assert.equal(o.text, authored.options.find((x) => x.id === o.id)!.en, `${L}: option ${o.id} is not English`);
    }
  }

  // -- the three labs: each one failed, then solved --------------------------
  for (let i = 1; i <= 3; i++) {
    const id = `${n}.${i}`;
    const miss = await post(`/api/labs/${id}/attempt`, { answer: wrongAnswer(id), lang: 'es' }, paid.sid);
    assert.equal(miss.status, 200, `lab ${id}: the attempt was not accepted`);
    const missed = await body(miss);
    assert.equal(missed.correct, false, `lab ${id}: a wrong answer came back CORRECT`);
    assert.ok(missed.explanation, `lab ${id}: no explanation after a miss — the student is told nothing`);
    assert.equal(JSON.stringify(missed).includes('"solution"'), false, `lab ${id}: the verdict leaks the solution`);
    assert.deepEqual(missed.nuevos, [], `lab ${id}: a wrong answer unlocked an achievement`);
  }

  // The counter the lesson page prints under every lab. One attempt each, none
  // solved — the state in which it used to read "sin intentos".
  const afterMiss = await body(await req(`/api/lessons/${n}`, {}, paid.sid));
  for (const lab of afterMiss.labs) {
    assert.equal(lab.solved, false, `lab ${lab.id}: a miss reads as solved`);
    assert.equal(lab.attempts, 1, `lab ${lab.id}: one failed attempt is reported as ${lab.attempts}`);
  }

  for (let i = 1; i <= 3; i++) {
    const id = `${n}.${i}`;
    const hit = await post(`/api/labs/${id}/attempt`, { answer: rightAnswer(id), lang: 'es' }, paid.sid);
    assert.equal(hit.status, 200, `lab ${id}: the attempt was not accepted`);
    const done = await body(hit);
    assert.equal(done.correct, true, `lab ${id}: the authored answer was graded WRONG over HTTP`);
    assert.ok(done.explanation, `lab ${id}: no explanation after solving`);
    solvedLabs++;
    if (REAL[id]!.kind === 'hotcold') {
      assert.equal(done.hint.err, 0, `lab ${id}: the exact answer does not report zero error`);
      assert.equal(done.hint.word, 'exacto', `lab ${id}: the Spanish hint word is '${done.hint.word}'`);
      const english = await body(await post(`/api/labs/${id}/attempt`,
        { answer: rightAnswer(id), lang: 'en' }, paid.sid));
      assert.equal(english.hint.word, 'exact', `lab ${id}: lang=en still answers in Spanish`);
    }
    if (REAL[id]!.kind === 'knob') {
      assert.deepEqual(done.hint.range, [sol(REAL[id]!).min, sol(REAL[id]!).max],
        `lab ${id}: the repeatable range is not reported back`);
    }
  }

  const afterHit = await body(await req(`/api/lessons/${n}`, {}, paid.sid));
  for (const lab of afterHit.labs) {
    assert.equal(lab.solved, true, `lab ${lab.id}: solved, but the page says otherwise`);
    assert.ok(lab.attempts >= 2, `lab ${lab.id}: the attempt count was lost once it was solved`);
  }

  // -- the quiz --------------------------------------------------------------
  for (const q of afterHit.quiz) {
    const authored = QUESTIONS.find((x) => x.id === q.id)!;
    assert.equal(q.options.length, 3, `${q.id}: not three options`);
    assert.equal(JSON.stringify(q).includes('"answer"'), false, `${q.id}: the public question carries the answer`);
    const wrong = authored.options.find((o) => o.id !== authored.answer)!.id;
    const missed = await body(await post(`/api/questions/${q.id}/attempt`, { answer: wrong, lang: 'es' }, paid.sid));
    assert.equal(missed.correct, false, `${q.id}: a wrong option came back correct`);
    assert.ok(missed.explanation, `${q.id}: no explanation after a miss`);
    const hit = await body(await post(`/api/questions/${q.id}/attempt`,
      { answer: authored.answer, lang: 'en' }, paid.sid));
    assert.equal(hit.correct, true, `${q.id}: the authored answer came back wrong`);
    assert.equal(hit.explanation, authored.explanation_en, `${q.id}: lang=en gave the Spanish explanation`);
    assert.ok(hit.score, `${q.id}: no running score`);
  }
  const quizDone = await body(await req(`/api/lessons/${n}`, {}, paid.sid));
  assert.deepEqual(quizDone.quizScore, { correct: 3, total: 3, passed: true, passAt: 3 },
    `${L}: the quiz does not come back passed`);
  for (const q of quizDone.quiz) assert.equal(q.solved, true, `${q.id}: solved, but the page says otherwise`);

  // -- what solving the lesson unlocked --------------------------------------
  const logros = await body(await req('/api/logros', {}, paid.sid));
  const codes = new Set((logros.logros as { code: string }[]).map((x) => x.code));
  for (const grade of LESSON_GRADES) {
    assert.ok(codes.has(lessonCode(n, grade)),
      `${L}: closing all three labs did not award '${lessonCode(n, grade)}'`);
  }
  // One rank per lesson closed COMPLETE, and they are taken in order here.
  assert.ok(codes.has(rankCode(n)), `${L}: closing lesson ${n} did not award ${rankCode(n)}`);
  assert.equal(logros.nivel, n, `${L}: rank is ${logros.nivel} after ${n} closed lessons`);
  if (n === 1) firstRank = String(logros.nivel);
}

assert.equal(solvedLabs, 36, `only ${solvedLabs} of 36 labs could be solved`);
assert.ok(firstRank !== null, 'the first lesson awarded no rank');

// ---------------------------------------------------------------------------
// 3 · the state the course ends in

const progress = await body(await req('/api/progress', {}, paid.sid));
assert.equal(progress.solvedLabs, 36, `progress reports ${progress.solvedLabs} solved labs, not 36`);
assert.equal(progress.lessonsDone, 12, `progress reports ${progress.lessonsDone} finished lessons, not 12`);
const final = await body(await req('/api/logros', {}, paid.sid));
assert.equal(final.nivel, 12, `twelve closed lessons should be rank 12, not ${final.nivel}`);

// The three exams open on the lessons they cover, and grade like the quizzes.
const exams = await body(await req('/api/exams', {}, paid.sid));
assert.equal(exams.exams.length, 3, 'three exams');
for (const e of exams.exams) {
  assert.equal(e.locked, false, `exam ${e.n} is locked for a paid account`);
  const paper = await body(await req(`/api/exams/${e.n}?lang=es`, {}, paid.sid));
  assert.equal(paper.questions.length, 6, `exam ${e.n} does not have six questions`);
  assert.equal(JSON.stringify(paper).includes('"solution"'), false, `exam ${e.n} carries a solution`);
  for (const q of paper.questions) {
    const authored = QUESTIONS.find((x) => x.id === q.id)!;
    assert.ok(authored, `exam ${e.n}: question ${q.id} is not in the catalogue`);
    assert.ok(authored.lesson_n >= e.from && authored.lesson_n <= e.to,
      `${q.id} examines lesson ${authored.lesson_n}, outside exam ${e.n} (${e.from}..${e.to})`);
    const hit = await body(await post(`/api/questions/${q.id}/attempt`, { answer: authored.answer }, paid.sid));
    assert.equal(hit.correct, true, `${q.id}: the authored answer came back wrong`);
  }
  const passed = await body(await req(`/api/exams/${e.n}`, {}, paid.sid));
  assert.equal(passed.score.passed, true, `exam ${e.n} does not pass on six of six`);
}

// Cleaned up by primary key, the way the other HTTP suite does it: these rows
// are this run's, and leaving them behind would move every later run's counts.
for (const table of ['attempts', 'question_attempts', 'achievements']) {
  await run(`DELETE FROM ${table} WHERE user_id IN (?, ?)`, [free.id, paid.id]).catch(() => {});
}
await run('DELETE FROM users WHERE id IN (?, ?)', [free.id, paid.id]);

console.log(`lessons over HTTP: 12 pages ES+EN · 36 labs failed then solved · 36 quiz items · 3 exams · rank ${final.nivel}`);
await pool.end();
process.exit(0);
