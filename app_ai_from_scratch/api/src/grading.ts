// Grading lives ONLY on the server: the client never receives `solution`.

const norm = (xs: unknown[]): string => xs.map(String).map((s) => s.trim()).sort().join('|');

/**
 * The parsed `solution` column. Every mechanic reads a different field, so the
 * fields are optional and the switch below is what decides which one is real.
 * Declared rather than left as `any` so a mechanic that reads `sol.cuts` on a
 * `knob` lab is visible here instead of being `undefined` at runtime.
 */
export interface Solution {
  value?: unknown;
  cuts?: unknown[];
  order?: unknown[];
  slots?: unknown[];
  /** `build` only: the tile texts each slot will take, by slot index. */
  accept?: Record<number, string[]>;
  min?: number;
  max?: number;
}

/** What the browser sends back. Shape depends on the mechanic. */
export type Answer = unknown;

/** The narrow row the grader is allowed to receive from data. */
export interface GradableLab { kind: string; solution: string }

export function grade(lab: GradableLab, answer: Answer): boolean {
  const sol = JSON.parse(lab.solution) as Solution;
  switch (lab.kind) {
    case 'choice':
      return String(answer) === String(sol.value);
    case 'cut':
      return Array.isArray(answer) && norm(answer) === norm(sol.cuts ?? []);
    case 'order':
      return Array.isArray(answer)
        && answer.map(String).join(',') === (sol.order ?? []).map(String).join(',');
    case 'build': {
      // Every slot filled, AND filled with a piece that slot will take.
      //
      // "Every slot holds a non-empty string" was the whole check, and the widget
      // pins each tile to its own declared slot — so no student could ever
      // produce a wrong answer except by leaving a slot empty. Three labs ship a
      // second tile set their own explanation calls wrong, and all three were
      // graded correct: lab 1.2 put a tick next to "3 photos / nothing labelled"
      // over the sentence "with 3 unlabelled examples it learns nothing".
      //
      // `accept` is REQUIRED, and its absence fails closed. A build lab whose
      // solution carries no allow-list is one this function cannot check, and an
      // answer that was never checked is not a correct answer (house rule 1).
      if (!answer || typeof answer !== 'object') return false;
      const slots = sol.slots ?? [];
      const accept = sol.accept;
      if (!slots.length || !accept) return false;
      return slots.every((_k, i) => {
        const v = (answer as Record<number, unknown>)[i];
        if (typeof v !== 'string') return false;
        const picked = v.trim();
        return picked.length > 0 && (accept[i] ?? []).includes(picked);
      });
    }
    case 'knob': {
      const t = Number(answer);
      return Number.isFinite(t) && t >= Number(sol.min) && t <= Number(sol.max);
    }
    case 'hotcold':
      return Number(answer) === Number(sol.value);
    default:
      return false;
  }
}

/** The hint shape per mechanic. `null` when the mechanic needs none. */
export type Hint =
  | { err: number; word: string }
  | { range: [number | undefined, number | undefined] }
  | null;

// Hint returned to the client when the mechanic needs one.
// Without this the client would have to know the answer in order to say «cold» or
// «hot». The words are product copy for a Spanish-language course and travel to
// web/src/pages/leccion/[n].astro as data: they are not identifiers.
export function hint(lab: GradableLab, answer: Answer, lang: 'es' | 'en' = 'es'): Hint {
  const sol = JSON.parse(lab.solution) as Solution;
  if (lab.kind === 'hotcold') {
    const err = Math.abs(Number(answer) - Number(sol.value));
    const word = lang === 'en'
      ? (err === 0 ? 'exact' : err <= 5 ? 'hot' : err <= 20 ? 'warm' : 'cold')
      : (err === 0 ? 'exacto' : err <= 5 ? 'caliente' : err <= 20 ? 'tibio' : 'frío');
    return { err, word };
  }
  if (lab.kind === 'knob') return { range: [sol.min, sol.max] };
  return null;
}

/** The best attempt on a lab, as the progress queries return it. */
export interface BestAttempt {
  lab_id: string;
  solved: number | null;
  attempts: number;
}

/** A lab as the client is allowed to see it: no `solution`, no `explanation`. */
export interface PublicLab {
  id: string;
  lesson: number;
  idx: number;
  level: string;
  kind: string;
  prompt: string;
  payload: unknown;
  draft: boolean;
  solved: boolean;
  attempts: number;
}

/** Paid lab fields that may cross to the browser. `solution` cannot be named here. */
export interface PublicLabSource {
  id: string;
  lesson_n: number;
  idx: number;
  level: string;
  kind: string;
  prompt: string;
  payload: string;
  draft: number;
}

/**
 * What the client MAY see.
 *
 * `solved` comes from the row's own `solved`, not from the row EXISTING. It used
 * to be `!!best`, which made the caller responsible for passing null on an
 * unsolved lab — and server.ts did exactly that, with
 * `best.solved === 1 ? best : null`. That is how the attempt counter was lost:
 * the null took `attempts` down with it, so a student who had missed a lab four
 * times was shown "sin intentos" under it, and the lesson page has no other
 * source for that number. Deciding it here from the value means there is no way
 * to pass the row and lose the count.
 */
export function publicLab(lab: PublicLabSource, best: BestAttempt | null | undefined): PublicLab {
  return {
    id: lab.id,
    lesson: lab.lesson_n,
    idx: lab.idx,
    level: lab.level,
    kind: lab.kind,
    prompt: lab.prompt,
    payload: JSON.parse(lab.payload),
    draft: !!lab.draft,
    solved: best?.solved === 1,
    attempts: best?.attempts ?? 0,
  };
}
