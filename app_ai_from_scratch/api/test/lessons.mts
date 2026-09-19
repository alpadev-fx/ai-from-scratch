// The twelve lessons, proved one at a time, with no database and no server.
//
// WHAT THIS IS FOR
// A lesson is not one artefact. It is a card, two prose blocks per language, two
// worked examples per language, three labs with three different mechanics, and
// three quiz questions — and every one of those is read by a different consumer
// (the page, the scene mounter, the grader, the agent). Nothing in the repo
// looked at a lesson AS A WHOLE, so a lesson could be half-authored, or authored
// and ungradable, and every gate stayed green: `astro check` type-checks a lab
// whose solution cannot be reached, and the seed writes whatever it is handed.
//
// THE ONE ASSERTION THAT MATTERS
// For every lab: the authored solution GRADES CORRECT, and a wrong answer that a
// student can actually produce in the browser GRADES WRONG. A lab that cannot be
// failed teaches nothing, and three of them could not be failed — see `decoy` in
// api/src/labs.ts.
//
// It reads api/src/labs.ts, which is the same module seed.ts writes from. Not a
// copy of the table: the table.

import assert from 'node:assert/strict';
import { KINDS, LESSONS, LEVELS, REAL, storedPayload, storedSolution } from '../src/labs.ts';
import type { LabSeed } from '../src/labs.ts';
import { LESSON_CONTENT } from '../src/content.ts';
import { grade, hint, publicLab } from '../src/grading.ts';
import type { Solution } from '../src/grading.ts';
import { QUESTIONS, storedOptions } from '../src/quizzes.ts';
import { localizeLesson } from '../src/lesson-meta.ts';

const N = 12;
const LANGS = ['es', 'en'] as const;
const ok = (s: unknown, why: string) => assert.ok(typeof s === 'string' && s.trim() !== '', why);

/**
 * A lab as the grader receives it: the row `lab.solution_for_grading` returns.
 * `storedSolution` and a JSON round trip, because that is exactly what the
 * column holds — a test that grades against the in-memory object would not
 * notice a field that does not survive serialisation.
 */
const gradable = (_id: string, r: LabSeed) =>
  ({ kind: r.kind, solution: JSON.stringify(storedSolution(r)) });

/** The first tile authored for each slot — the answer a student assembles first. */
const tilesOf = (r: LabSeed) => (r.payload as { tiles?: { slot: number; text: string }[] }).tiles ?? [];
const firstFill = (r: LabSeed) => {
  const slots = (r.solution as Solution).slots ?? [];
  const out: Record<number, string> = {};
  slots.forEach((_s, i) => {
    const tile = tilesOf(r).find((t) => t.slot === i);
    if (tile) out[i] = tile.text;
  });
  return out;
};

// ---------------------------------------------------------------------------
// 1 · the shape of the course

assert.equal(LESSONS.length, N, 'twelve lessons');
assert.deepEqual(LESSONS.map((l) => l[0]), Array.from({ length: N }, (_, i) => i + 1),
  'lessons are numbered 1..12 in order');
assert.equal(Object.keys(REAL).length, N * 3, 'thirty-six labs are written, none left a draft');
assert.equal(Object.keys(KINDS).length, N, 'every lesson declares its three mechanics');

// Every mechanic the labs use is one the grader knows. A lab with a mechanic
// `grade` has no case for falls through to `default: return false` — unsolvable,
// and nothing else in the repo notices.
const GRADED = new Set(['choice', 'cut', 'order', 'build', 'knob', 'hotcold']);
for (const [id, r] of Object.entries(REAL)) {
  assert.ok(GRADED.has(r.kind), `${id}: mechanic '${r.kind}' has no case in grade()`);
}

// ---------------------------------------------------------------------------
// 2 · every lesson, end to end

for (const [n, eyebrow, title, summary, math, mathCap] of LESSONS) {
  const L = `lesson ${n}`;

  // -- the card, both languages ---------------------------------------------
  for (const [field, value] of Object.entries({ eyebrow, title, summary, math, mathCap })) {
    ok(value, `${L}: card.${field} is empty`);
  }
  const en = localizeLesson({ n, eyebrow, title, summary, math, math_cap: mathCap }, 'en');
  assert.notEqual(en.title, title, `${L}: the English card was never authored (falls back to Spanish)`);
  for (const field of ['eyebrow', 'title', 'summary', 'math', 'math_cap'] as const) {
    ok((en as Record<string, unknown>)[field], `${L}: English card.${field} is empty`);
  }

  // -- the teaching text, both languages ------------------------------------
  const byLang = LESSON_CONTENT[n];
  assert.ok(byLang, `${L}: no teaching text at all`);
  for (const lang of LANGS) {
    const t = byLang[lang];
    assert.ok(t, `${L}: no ${lang} teaching text — the page shows the translation-pending card`);
    ok(t.technical, `${L}/${lang}: technical is empty`);
    ok(t.analogy, `${L}/${lang}: analogy is empty`);
    assert.equal(t.examples.length, 2, `${L}/${lang}: a lesson carries exactly two worked examples`);
    // Exactly the predicate web/src/lib/scenes/index.ts#isExample applies. A field
    // that is missing or blank does not error: the animation silently does not
    // mount and the lesson quietly loses its scene.
    for (const [i, e] of t.examples.entries()) {
      for (const field of ['titulo', 'entrada', 'salida', 'nota'] as const) {
        ok(e[field], `${L}/${lang}: example ${i + 1}.${field} is blank — the scene will not mount`);
      }
    }
  }

  // -- the three labs --------------------------------------------------------
  for (let i = 1; i <= 3; i++) {
    const id = `${n}.${i}`;
    const r = REAL[id];
    const T = `lab ${id}`;
    assert.ok(r, `${T}: not written`);
    assert.equal(r.kind, KINDS[n]![i - 1], `${T}: mechanic does not match the design table`);
    ok(r.prompt, `${T}: no prompt`);
    ok(r.explanation, `${T}: no explanation — the student is told nothing after answering`);
    assert.equal(/\[Por escribir\]/.test(r.prompt + r.explanation), false, `${T}: placeholder text shipped`);

    const sol = r.solution as Solution;
    const g = gradable(id, r);

    // The payload crosses to the browser and to the agent. It must not encode
    // the answer, and it must carry everything the widget needs to render.
    const payloadText = JSON.stringify(storedPayload(id, r));

    switch (r.kind) {
      case 'choice': {
        const options = (r.payload as { options?: string[] }).options ?? [];
        assert.ok(options.length >= 3, `${T}: a choice needs at least three options`);
        assert.equal(new Set(options).size, options.length, `${T}: duplicate options`);
        assert.ok(options.includes(String(sol.value)), `${T}: the answer is not one of the options`);
        assert.equal(grade(g, sol.value), true, `${T}: the authored answer does not grade correct`);
        for (const wrong of options.filter((o) => o !== String(sol.value))) {
          assert.equal(grade(g, wrong), false, `${T}: '${wrong}' is accepted as well as the answer`);
        }
        break;
      }
      case 'order': {
        const steps = (r.payload as { steps?: { id: string; text: string }[] }).steps ?? [];
        const order = (sol.order ?? []).map(String);
        assert.ok(steps.length >= 3, `${T}: an order lab needs at least three steps`);
        assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, `${T}: duplicate step ids`);
        for (const s of steps) ok(s.text, `${T}: step ${s.id} has no text`);
        assert.deepEqual([...order].sort(), steps.map((s) => s.id).sort(),
          `${T}: solution.order is not a permutation of the steps`);
        assert.equal(grade(g, order), true, `${T}: the authored order does not grade correct`);
        assert.equal(grade(g, [...order].reverse()), false, `${T}: the reversed order is accepted`);
        assert.equal(grade(g, order.slice(0, -1)), false, `${T}: an incomplete order is accepted`);
        // The stored payload is what the browser gets. Authored in solution order,
        // it recites the answer to anyone who opens devtools.
        const stored = (storedPayload(id, r) as { steps: { id: string }[] }).steps.map((s) => s.id);
        assert.notDeepEqual(stored, order, `${T}: the stored payload is in solution order`);
        break;
      }
      case 'build': {
        const slots = (r.payload as { slots?: string[] }).slots ?? [];
        const tiles = tilesOf(r);
        assert.ok(slots.length >= 3, `${T}: a build lab needs at least three slots`);
        assert.deepEqual(sol.slots, slots, `${T}: solution.slots and payload.slots disagree`);
        for (let s = 0; s < slots.length; s++) {
          assert.ok(tiles.some((t) => t.slot === s), `${T}: slot ${s} has no tile to fill it`);
        }
        for (const t of tiles) {
          assert.ok(t.slot >= 0 && t.slot < slots.length, `${T}: tile '${t.text}' targets slot ${t.slot}`);
          ok(t.text, `${T}: a tile has no text`);
        }

        // Every build lab carries an explicit per-slot allow-list. Without one
        // `grade` refuses the lab outright, which is the fail-closed half of the
        // fix: a new build lab cannot be shipped unchecked and pass anyway.
        const accept = (JSON.parse(g.solution) as Solution).accept;
        assert.ok(accept, `${T}: no accept list — grade() cannot check this lab`);
        for (let s = 0; s < slots.length; s++) {
          assert.ok((accept[s] ?? []).length > 0, `${T}: slot ${s} accepts nothing at all`);
          for (const text of accept[s]!) {
            assert.ok(tiles.some((t) => t.slot === s && t.text === text),
              `${T}: slot ${s} accepts '${text}', which is not a tile the student can click`);
          }
        }

        const filled = firstFill(r);
        assert.equal(grade(g, filled), true, `${T}: the assembled request does not grade correct`);

        // Every tile the pool offers for a slot either grades correct there or is
        // declared a decoy. A tile that is neither is a trap nothing documents.
        for (const t of tiles) {
          const expected = !(r.decoy?.[t.slot] ?? []).includes(t.text);
          assert.equal(grade(g, { ...filled, [t.slot]: t.text }), expected,
            `${T}: tile '${t.text}' in slot ${t.slot} grades ${!expected} — decoy and allow-list disagree`);
        }

        // A slot left empty is the one failure every build lab must have.
        for (let s = 0; s < slots.length; s++) {
          const missing = { ...filled };
          delete missing[s];
          assert.equal(grade(g, missing), false, `${T}: accepted with slot ${s} ('${slots[s]}') empty`);
        }

        // The tile pool of 1.2, 8.3 and 10.2 holds a SECOND set that the lab's own
        // explanation calls wrong ("3 photos, nothing labelled" teaches nothing).
        // The student can click it, and it must not come back with a tick.
        for (const [slotKey, texts] of Object.entries(r.decoy ?? {})) {
          const s = Number(slotKey);
          for (const text of texts) {
            assert.ok(tiles.some((t) => t.slot === s && t.text === text),
              `${T}: decoy '${text}' is not a tile in slot ${s}`);
            assert.equal(grade(g, { ...filled, [s]: text }), false,
              `${T}: '${text}' in slot ${s} is graded CORRECT, and the explanation says it is wrong`);
          }
        }
        break;
      }
      case 'cut': {
        const words = (r.payload as { words?: string[] }).words ?? [];
        const cuts = (sol.cuts ?? []).map(String);
        assert.ok(words.length >= 2, `${T}: a cut lab needs at least two words`);
        assert.ok(cuts.length >= 1, `${T}: no cut is authored`);
        for (const c of cuts) {
          const [w, at] = c.split('-').map(Number);
          assert.ok(words[w] !== undefined, `${T}: cut '${c}' names word ${w}, which does not exist`);
          assert.ok(at >= 0 && at < words[w].length - 1, `${T}: cut '${c}' is outside '${words[w]}'`);
        }
        assert.equal(grade(g, cuts), true, `${T}: the authored cuts do not grade correct`);
        assert.equal(grade(g, [...cuts].reverse()), true, `${T}: cuts are a set, order must not matter`);
        assert.equal(grade(g, []), false, `${T}: cutting nothing is accepted`);
        assert.equal(grade(g, [...cuts, '0-0']), false, `${T}: an extra cut is accepted`);
        break;
      }
      case 'knob': {
        const p = r.payload as { min?: number; max?: number; cands?: { name: string; logit: number }[] };
        const cands = p.cands ?? [];
        assert.ok(cands.length >= 2, `${T}: a knob lab needs candidates to weigh`);
        for (const c of cands) {
          ok(c.name, `${T}: a candidate has no name`);
          assert.equal(Number.isFinite(c.logit), true, `${T}: candidate '${c.name}' has no score`);
        }
        assert.equal(Number.isFinite(sol.min) && Number.isFinite(sol.max), true, `${T}: no accepted range`);
        assert.ok(sol.min! < sol.max!, `${T}: the accepted range is empty`);
        assert.ok(sol.min! >= (p.min ?? 0) && sol.max! <= (p.max ?? 100),
          `${T}: the accepted range leaves the slider`);
        assert.equal(grade(g, Math.round((sol.min! + sol.max!) / 2)), true, `${T}: the middle of the range is rejected`);
        assert.equal(grade(g, sol.min), true, `${T}: the range is inclusive at the bottom`);
        assert.equal(grade(g, sol.max), true, `${T}: the range is inclusive at the top`);
        assert.equal(grade(g, sol.max! + 1), false, `${T}: one past the range is accepted`);
        assert.equal(grade(g, 'no'), false, `${T}: a non-number is accepted`);
        // The widget starts at 20 and that is what it posts if nothing is touched.
        // Whether that is right or wrong is the lab's business; that it is DECIDED
        // rather than accidental is this assertion's.
        assert.equal(grade(g, 20), sol.min! <= 20 && 20 <= sol.max!, `${T}: the slider's own default is undecided`);
        break;
      }
      case 'hotcold': {
        const p = r.payload as { min?: number; max?: number };
        assert.equal(Number.isFinite(p.min) && Number.isFinite(p.max), true, `${T}: the slider has no range`);
        assert.ok(Number(sol.value) >= p.min! && Number(sol.value) <= p.max!,
          `${T}: the answer ${sol.value} is outside the slider's own ${p.min}..${p.max}`);
        assert.equal(grade(g, sol.value), true, `${T}: the authored number does not grade correct`);
        assert.equal(grade(g, Number(sol.value) + 1), false, `${T}: one off is accepted`);
        // The hint is the whole mechanic: without it the slider is a 100-way guess.
        const near = hint(g, Number(sol.value) + 3) as { err: number; word: string };
        const far = hint(g, p.min!) as { err: number; word: string };
        assert.equal(near.err, 3, `${T}: the hint miscounts the distance`);
        assert.notEqual(near.word, far.word, `${T}: near and far read the same`);
        // Both languages, because the lab posts the reader's language with the answer.
        const es = hint(g, Number(sol.value) + 3, 'es') as { word: string };
        const inEnglish = hint(g, Number(sol.value) + 3, 'en') as { word: string };
        assert.notEqual(es.word, inEnglish.word, `${T}: the hint word is not translated`);
        assert.match(inEnglish.word, /^(exact|hot|warm|cold)$/, `${T}: '${inEnglish.word}' is not English`);
        break;
      }
      default:
        assert.fail(`${T}: unhandled mechanic '${r.kind}'`);
    }

    // What the browser receives must not recite the answer.
    //
    // Three mechanics are exempt and each for a stated reason: a `choice`
    // payload IS the options, a `build` payload IS the answer pieces (picking
    // and placing them is the exercise), and an `order` payload carries the step
    // ids because that is how the browser names a step — the leak there is the
    // step ORDER, asserted above against the stored shuffle. `cut` has no such
    // excuse: its coordinates appear nowhere a student can read.
    if (r.kind === 'cut') {
      for (const c of (sol.cuts ?? []).map(String)) {
        assert.equal(payloadText.includes(c), false, `${T}: the payload contains the cut '${c}'`);
      }
    }

    // What the API hands the page. `attempts` is the count the lesson prints
    // under every lab, and it is printed for solved and unsolved alike.
    const row = {
      id, lesson_n: n, idx: i, level: LEVELS[i - 1]!, kind: r.kind,
      prompt: r.prompt, payload: JSON.stringify(storedPayload(id, r)), draft: 0,
    };
    const tried = publicLab(row, { lab_id: id, solved: 0, attempts: 4 });
    assert.equal(tried.solved, false, `${T}: an unsolved attempt reads as solved`);
    assert.equal(tried.attempts, 4, `${T}: four failed attempts are reported as ${tried.attempts}`);
    const solved = publicLab(row, { lab_id: id, solved: 1, attempts: 2 });
    assert.equal(solved.solved, true, `${T}: a solved lab reads as unsolved`);
    assert.equal(solved.attempts, 2, `${T}: the attempt count is lost once solved`);
    const untouched = publicLab(row, null);
    assert.equal(untouched.attempts, 0, `${T}: an untouched lab claims attempts`);
    assert.equal(JSON.stringify(tried).includes('solution'), false, `${T}: the public lab carries a solution`);
    assert.equal(JSON.stringify(tried).includes('explanation'), false, `${T}: the public lab carries the explanation`);
  }

  // -- the quiz --------------------------------------------------------------
  const pack = `q${String(n).padStart(2, '0')}`;
  const quiz = QUESTIONS.filter((q) => q.pack === pack);
  assert.equal(quiz.length, 3, `${L}: a lesson carries three quiz questions`);
  assert.deepEqual(quiz.map((q) => q.idx).sort(), [1, 2, 3], `${L}: quiz questions are numbered 1..3`);
  for (const q of quiz) {
    assert.equal(q.lesson_n, n, `${q.id}: filed under lesson ${q.lesson_n}, packed with lesson ${n}`);
    assert.equal(q.kind, 'quiz', `${q.id}: is not a quiz`);
    assert.ok(q.options.some((o) => o.id === q.answer), `${q.id}: the answer is not an option`);
    assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length, `${q.id}: duplicate option ids`);
    for (const o of q.options) {
      ok(o.es, `${q.id}: option ${o.id} has no Spanish`);
      ok(o.en, `${q.id}: option ${o.id} has no English`);
    }
    // Stored order, which is what the browser paints. The answer first is a
    // giveaway to anyone who has taken two quizzes.
    assert.notEqual(storedOptions(q)[0]!.id, q.answer, `${q.id}: the answer is stored first`);
    assert.deepEqual(storedOptions(q).map((o) => o.id).sort(), q.options.map((o) => o.id).sort(),
      `${q.id}: the stored options are not the authored ones`);
    // The quiz is graded by the same function as a choice lab.
    const g = { kind: 'choice', solution: JSON.stringify({ value: q.answer }) };
    assert.equal(grade(g, q.answer), true, `${q.id}: the authored answer does not grade correct`);
    for (const o of q.options.filter((x) => x.id !== q.answer)) {
      assert.equal(grade(g, o.id), false, `${q.id}: option ${o.id} is accepted too`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3 · across the course
//
// A pattern the student can exploit without reading is a lesson that does not
// teach. Sixteen choice labs with the answer at index 1 twelve times is
// "always click the second one", and it passes three quarters of the course.

const choiceLabs = Object.entries(REAL).filter(([, r]) => r.kind === 'choice');
const positions = choiceLabs.map(([id, r]) => {
  // The STORED options: what the browser paints. The authored order is not what
  // anybody sees, and it is the authored order that had the answer second
  // thirteen times out of sixteen.
  const options = (storedPayload(id, r) as { options: string[] }).options;
  return options.indexOf(String((r.solution as Solution).value));
});
for (const slot of new Set(positions)) {
  const share = positions.filter((p) => p === slot).length / positions.length;
  assert.ok(share <= 0.5,
    `${Math.round(share * 100)}% of choice labs put the answer at option ${slot + 1}: `
    + 'clicking that one position passes most of the course without reading');
}

console.log(`lessons: ${N} cards ES+EN · ${N * 2} teaching texts · ${Object.keys(REAL).length} labs graded `
  + `both ways · ${QUESTIONS.filter((q) => q.kind === 'quiz').length} quiz items`);
