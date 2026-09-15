#!/usr/bin/env node
/**
 * Every lesson's example text feeds its own animation — in BOTH languages.
 *
 * WHAT IT CATCHES, AND WHY NOTHING ELSE DOES
 * The twelve scenes are not decoration with a caption. Each one is driven by the
 * lesson's own `entrada` / `salida` strings, parsed at runtime:
 *
 *   lesson 2  firstInt(salida)        the error the readout counts down to
 *   lesson 3  decimals(salida)        the weights the dials land on
 *   lesson 5  piecesAfterColon(salida) the chips the word splits into
 *   lesson 6  scorePairs(salida)      the score bars, and which one wins
 *   lesson 7  parenSlots(entrada)     what fills "what / who for / how"
 *   lesson 8  firstInt(entrada)       whether the first message falls off the desk
 *   lesson 9  oddOfTen(salida)        how many of ten runs come out different
 *
 * Every one of those readers FALLS BACK rather than throwing, because a broken
 * animation must never take the reading down with it (see scenes/mount.ts). That
 * is right, and it is also why this is invisible: rewrite lesson 6's English
 * `salida` without its "hot 31 · good 22" scores and the English page quietly
 * drops the score board that the Spanish page still shows. No type breaks, no
 * test fails, nothing errors in the console. The two languages simply stop
 * teaching the same thing.
 *
 * So the assertion is: the two languages must extract the SAME SHAPE. Not the
 * same words — the same number of chips, the same number of slots, the same
 * overflow verdict, the same winner position. Plus, where a scene has no honest
 * fallback at all, that the value is actually there.
 *
 * WHY IT LIVES IN scripts/ RATHER THAN IN api/ OR web/
 * It is one of the two checks whose whole job is comparing one service against
 * another: the lesson prose is authored in api/src/content.ts and the readers
 * that parse it ship in web/src/lib/scenes/kit.ts. It imports both, by import
 * and not by regex, so neither side can be renamed out from under it silently.
 *
 * Usage:  node --experimental-strip-types scripts/check-lesson-scenes.mjs
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { LESSON_CONTENT } = await import(`${ROOT}/api/src/content.ts`);
const kit = await import(`${ROOT}/web/src/lib/scenes/kit.ts`);
const { firstInt, decimals, scorePairs, parenSlots, piecesAfterColon, quoted, wordsOf, oddOfTen } = kit;

const LANGS = ['es', 'en'];
const LESSONS = 12;
const problems = [];
const note = [];
const bad = (msg) => problems.push(msg);

/**
 * What each lesson's scene reads out of one example.
 *
 * `shape` is compared ACROSS LANGUAGES and must match exactly.
 * `required` is a message when the scene has no honest fallback for a missing
 * value — null when the fallback is a deliberate second ending (lesson 5's "1
 * token" has nothing to split, and the scene says exactly that).
 */
const READS = {
  // examples-arrive: the first row repeats `entrada` verbatim. Nothing parsed.
  1: (e) => ({ shape: { row: wordsOf(e.entrada).length > 0 }, required: wordsOf(e.entrada).length ? null : 'entrada is empty: the first row of the list would be blank' }),
  // error-closes: the readout counts down to the error the lesson states.
  2: (e) => {
    const n = firstInt(e.salida);
    return {
      shape: { hops: n === null ? null : n >= 60 ? 1 : 3 },
      required: n === null ? `salida states no error number, so the readout falls back to 4 and contradicts the text: "${e.salida}"` : null,
    };
  },
  // dials-settle: the printed weights become the first dials, readout and all.
  3: (e) => ({ shape: { known: decimals(e.salida).length }, required: null }),
  // dials-hold: the panel is seeded from `entrada`; nothing is parsed out of it.
  4: (e) => ({ shape: { seeded: e.entrada.length > 0 }, required: null }),
  // word-splits: the chips are the pieces the lesson wrote after the colon.
  5: (e) => ({ shape: { pieces: (piecesAfterColon(e.salida) ?? [e.entrada]).length }, required: null }),
  // next-word: the score bars, and which candidate wins.
  6: (e) => {
    const pairs = scorePairs(e.salida);
    const scored = pairs.length >= 2 ? pairs.slice(0, 5) : [];
    const winner = scored.length ? scored.reduce((a, b) => (b.value > a.value ? b : a)) : null;
    const base = wordsOf(scored.length ? (quoted(e.entrada) ?? e.entrada) : (quoted(e.salida) ?? e.salida));
    return {
      shape: { bars: scored.length, winnerAt: winner ? scored.indexOf(winner) : -1, words: base.length > 0 },
      required: base.length ? null : 'neither entrada nor salida yields a sentence for the scene to grow',
    };
  },
  // three-slots: the slots the request names out loud, in its own parentheses.
  7: (e) => ({ shape: { slots: parenSlots(e.entrada).slice(0, 3).length }, required: null }),
  // window-fills: how many messages arrive, and therefore whether yours falls off.
  8: (e) => {
    const n = firstInt(e.entrada);
    return {
      shape: { overflows: n === null ? null : n > 5 },
      required: n === null ? `entrada names no message count, so the window scene falls back to 1: "${e.entrada}"` : null,
    };
  },
  // variety-slider: how many of ten runs came out different.
  9: (e) => {
    const odd = oddOfTen(e.salida);
    return {
      shape: { odd },
      required: /\d/.test(e.salida) ? null : `salida counts nothing, so the dial falls back to 3 of 10: "${e.salida}"`,
    };
  },
  // fluent-then-doubt: types `salida` out itself; the frame's outcome row is off,
  // so an empty salida would leave the scene with nothing to say at all.
  10: (e) => ({ shape: { words: wordsOf(e.salida).length > 0 }, required: wordsOf(e.salida).length ? null : 'salida is empty and this scene renders it INSTEAD of the outcome row: the example would show nothing' }),
  // cutoff-line: fixed geometry; the example only supplies the two text rows.
  11: (e) => ({ shape: { rows: e.entrada.length > 0 && e.salida.length > 0 }, required: null }),
  // prompt-sent: types `entrada` into the composer; the ask row is switched off.
  12: (e) => ({ shape: { typed: wordsOf(e.entrada).length > 0 }, required: wordsOf(e.entrada).length ? null : 'entrada is empty and this scene types it INSTEAD of the ask row: the composer would be blank' }),
};

// ---------------------------------------------------------------------------

for (let n = 1; n <= LESSONS; n++) {
  const byLang = LESSON_CONTENT[n];
  const read = READS[n];
  if (!read) { bad(`lesson ${n}: this checker has no reader for it — add one or it is unchecked`); continue; }
  if (!byLang) { bad(`lesson ${n}: no teaching text at all`); continue; }

  const shapes = {};
  for (const lang of LANGS) {
    const text = byLang[lang];
    if (!text) { bad(`lesson ${n}/${lang}: no teaching text`); continue; }
    if (text.examples.length !== 2) {
      bad(`lesson ${n}/${lang}: ${text.examples.length} examples, and the page draws two scenes`);
      continue;
    }
    shapes[lang] = text.examples.map((e, i) => {
      // The exact predicate scenes/index.ts#isExample applies before mounting.
      for (const field of ['titulo', 'entrada', 'salida', 'nota']) {
        if (typeof e[field] !== 'string' || !e[field].trim()) {
          bad(`lesson ${n}/${lang}: example ${i + 1} has no ${field} — isExample() rejects it and NO scene mounts`);
        }
      }
      const r = read(e);
      if (r.required) bad(`lesson ${n}/${lang} example ${i + 1}: ${r.required}`);
      return r.shape;
    });
  }

  if (!shapes.es || !shapes.en) continue;
  for (let i = 0; i < 2; i++) {
    const a = JSON.stringify(shapes.es[i]);
    const b = JSON.stringify(shapes.en[i]);
    if (a !== b) {
      bad(`lesson ${n} example ${i + 1}: the two languages animate differently — es ${a} vs en ${b}. `
        + 'The reader gets a different lesson depending on the language they chose.');
    }
  }
  note.push(`  ${String(n).padStart(2, '0')}  ${JSON.stringify(shapes.es[0])} · ${JSON.stringify(shapes.es[1])}`);
}

console.log(`lesson scenes: ${LESSONS} lessons × 2 examples × ${LANGS.length} languages, read by the same parsers the browser runs`);
if (process.argv.includes('--verbose')) console.log(note.join('\n'));

if (problems.length) {
  console.error();
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\n${problems.length} problem(s). Every one of these degrades SILENTLY: the reader still`);
  console.error('gets the lesson text, so nothing errors and nothing else notices.');
  process.exit(1);
}
console.log('ok: every scene gets what it reads, and both languages animate alike.');
