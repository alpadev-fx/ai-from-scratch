// Content seeding. Idempotent on purpose: it runs on every `pnpm dev` and must
// update lessons and labs in place without touching anybody's attempts.
import { migrate, pool, run } from './db.ts';
import { LESSON_CONTENT } from './content.ts';
import type { LessonText } from './content.ts';
import { hashPassword } from './auth.ts';
import { QUESTIONS, storedOptions } from './quizzes.ts';
// The authored course. It lives in its own module so the gate that proves every
// lesson is solvable reads the SAME rows this script writes — importing seed.ts
// would run it. See api/src/labs.ts.
import { KINDS, LESSONS, LEVELS, REAL, storedPayload, storedSolution } from './labs.ts';

// The root/root account, refused before this file opens a connection.
//
// `root` is four characters and it is an admin, so NODE_ENV is not a strong
// enough gate: it is unset by default, and the box that forgets to set it is
// exactly the box that must not get this row. The database host is the fact
// that cannot be forgotten, so this also refuses any host that is not a local
// Postgres. Both checks run before the first query, so a misdirected seed
// stops with this message instead of connecting and failing later somewhere
// less obvious. It exists so a laptop has a two-keystroke admin; it is not a
// credential and it must never leave the laptop.
const rootUser = process.env.SEED_ROOT_USER === '1';
if (rootUser) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SEED_ROOT_USER=1 with NODE_ENV=production. root/root is a local-only account.');
  }
  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://sin-configurar/x').hostname;
  if (dbHost !== 'localhost' && dbHost !== '127.0.0.1' && dbHost !== '::1') {
    throw new Error(`SEED_ROOT_USER=1 against ${dbHost}. root/root only goes into a local database.`);
  }
}

await migrate();

const INS_LESSON = `INSERT INTO lessons (n,eyebrow,title,summary,math,math_cap) VALUES (?,?,?,?,?,?)
  ON CONFLICT (n) DO UPDATE SET eyebrow = excluded.eyebrow, title = excluded.title,
    summary = excluded.summary, math = excluded.math, math_cap = excluded.math_cap`;
for (const l of LESSONS) await run(INS_LESSON, l);

// Re-seeds without deleting attempts: the labs are updated in place.
const INS_LAB = `INSERT INTO labs (id,lesson_n,idx,level,kind,prompt,payload,solution,explanation,draft)
  VALUES (?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT (id) DO UPDATE SET lesson_n = excluded.lesson_n, idx = excluded.idx,
    level = excluded.level, kind = excluded.kind, prompt = excluded.prompt,
    payload = excluded.payload, solution = excluded.solution,
    explanation = excluded.explanation, draft = excluded.draft`;

let real = 0, draft = 0;
for (const [n] of LESSONS) {
  for (let i = 1; i <= 3; i++) {
    const id = `${n}.${i}`;
    const r = REAL[id];
    if (r) {
      await run(INS_LAB, [id, n, i, LEVELS[i - 1]!, r.kind, r.prompt,
        JSON.stringify(storedPayload(id, r)), JSON.stringify(storedSolution(r)), r.explanation, 0]);
      real++;
    } else {
      const kind = KINDS[n]![i - 1]!;
      await run(INS_LAB, [id, n, i, LEVELS[i - 1]!, kind,
        `[Por escribir] Lab ${id} · mecánica: ${kind}`,
        JSON.stringify({}), JSON.stringify({ value: null }),
        '[Por escribir] La explicación se redacta junto al enunciado.', 1]);
      draft++;
    }
  }
}

// Teaching text per lesson and language. This is what gets read BEFORE the lab.
const INS_TEXT = `INSERT INTO lesson_text (lesson_n, lang, technical, analogy, examples) VALUES (?,?,?,?,?)
  ON CONFLICT (lesson_n, lang) DO UPDATE SET technical = EXCLUDED.technical,
    analogy = EXCLUDED.analogy, examples = EXCLUDED.examples`;
let texts = 0;
for (const [n, byLanguage] of Object.entries(LESSON_CONTENT)) {
  for (const [lang, t] of Object.entries(byLanguage as Record<string, LessonText>)) {
    await run(INS_TEXT, [Number(n), lang, t.technical, t.analogy, JSON.stringify(t.examples)]);
    texts++;
  }
}

const INS_USER = `INSERT INTO users (email,name,pass_hash,role,paid,cohort) VALUES (?,?,?,?,?,?)
  ON CONFLICT (email) DO UPDATE SET pass_hash = excluded.pass_hash, role = excluded.role,
    paid = excluded.paid, cohort = excluded.cohort, deleted_at = NULL`;
// Demo accounts.
//
// These used to be created on every boot with a password committed to this
// repository, one of them an admin. docker-compose ran the seed on every start,
// so any deployment of this tree shipped a live admin whose credentials were
// public. They are now opt-in and refuse to exist in production, and the
// password comes from the environment with no default.
const demoUsers = process.env.SEED_DEMO_USERS === '1';
let seeded = 0;
if (demoUsers && process.env.NODE_ENV === 'production') {
  throw new Error('SEED_DEMO_USERS=1 with NODE_ENV=production. Demo accounts are for local use only.');
}
if (demoUsers) {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error('SEED_DEMO_USERS=1 requires SEED_DEMO_PASSWORD (10+ chars). There is no default.');
  }
  // `await hashPassword`, not `hashPassword`. It has been async since the KDF
  // moved off the calling thread (auth.ts), and without the await the Promise
  // itself was passed to pg: a fresh seed wrote the string "[object Promise]"
  // into users.pass_hash and the demo accounts could not log in. Opt-in demo
  // rows are refreshed on conflict so a new ephemeral test password remains usable.
  const hash = await hashPassword(password);
  for (const u of [
    ['ricardo@velez.co', 'Ricardo Vélez', 'student', 1, 'agosto'],
    ['paula@correo.com', 'Paula Gómez', 'tutor', 1, 'agosto'],
    ['founder.alpadev@gmail.com', 'Alejandro Padrón', 'admin', 1, null],
  ] as [string, string, string, number, string | null][]) {
    await run(INS_USER, [u[0], u[1], hash, u[2], u[3], u[4]]);
    seeded++;
  }
}

if (rootUser) {
  await run(INS_USER, ['root', 'root', await hashPassword('root'), 'root', 1, null]);
  seeded++;
}

const INS_Q = `INSERT INTO questions (id,kind,pack,idx,lesson_n,prompt_es,prompt_en,payload,solution,explanation_es,explanation_en)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, pack = excluded.pack, idx = excluded.idx,
    lesson_n = excluded.lesson_n, prompt_es = excluded.prompt_es, prompt_en = excluded.prompt_en,
    payload = excluded.payload, solution = excluded.solution,
    explanation_es = excluded.explanation_es, explanation_en = excluded.explanation_en`;
let quizzes = 0;
for (const item of QUESTIONS) {
  await run(INS_Q, [
    item.id, item.kind, item.pack, item.idx, item.lesson_n,
    item.prompt_es, item.prompt_en,
    JSON.stringify({ options: storedOptions(item) }),
    JSON.stringify({ value: item.answer }),
    item.explanation_es, item.explanation_en,
  ]);
  quizzes++;
}

console.log(`seeded: ${LESSONS.length} lessons · ${real} written labs · ${draft} draft labs · ${texts} lesson texts · ${quizzes} quiz/exam items · ${seeded} demo users`);
await pool.end();
