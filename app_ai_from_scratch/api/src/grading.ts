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
  /** build: por indice de hueco, los textos que el autor dio por validos. */
  accept?: Record<string, unknown>;
  min?: number;
  max?: number;
}

/** What the browser sends back. Shape depends on the mechanic. */
export type Answer = unknown;

/** The narrow row the grader is allowed to receive from data. */
export interface GradableLab { kind: string; solution: string }

/**
 * La respuesta que hay que ENVIAR para acertar este ejercicio, derivada de su
 * solucion. `null` cuando no se puede derivar sin inventar contenido.
 *
 * POR QUE VIVE AQUI Y NO EN LA PANTALLA. La forma de `solution` y la de `answer`
 * NO son la misma, y esa diferencia es justo donde se cuela el fallo: un `choice`
 * se corrige con `String(answer) === String(sol.value)`, asi que hay que mandar
 * el texto pelado y no `{value: ...}`. Medido: mandar el objeto devuelve
 * correct:false. Si esta derivacion viviera en el Astro, nada podria probarla, y
 * un boton que manda la forma equivocada no es un boton que no funciona -- es un
 * INTENTO FALLIDO escrito en attempts, con el progreso del admin ensuciado y sin
 * forma de distinguirlo de un fallo de verdad.
 *
 * Aqui, en cambio, `grade()` esta al lado y api/test/resolver.mts pasa las 36 y
 * las 54 por las dos funciones: lo que esta derivacion produce tiene que ser lo
 * que aquel grader acepta, para cada mecanica y para cada fila que haya en la
 * base, no para las que alguien recuerde al escribir el test.
 *
 * `null` para un `build` sin `accept`: ese grader da por bueno cualquier texto no
 * vacio, asi que rellenarlo seria trivial -- y seria inventar. Lo que quedaria en
 * attempts.answer es una respuesta que ningun autor escribio. Vale mas un boton
 * apagado que diga por que.
 */
export function answerFor(kind: string, solutionJson: string): unknown | null {
  let sol: Solution;
  try { sol = JSON.parse(solutionJson) as Solution; } catch { return null; }
  switch (kind) {
    case 'choice':
      return typeof sol.value === 'string' || typeof sol.value === 'number' ? sol.value : null;
    case 'hotcold':
      return typeof sol.value === 'number' ? sol.value : null;
    // Cualquier punto del rango vale; `min` es el unico que siempre existe si el
    // rango existe, y esta dentro por definicion.
    case 'knob':
      return typeof sol.min === 'number' && typeof sol.max === 'number' && sol.min <= sol.max ? sol.min : null;
    case 'cut':
      return Array.isArray(sol.cuts) ? sol.cuts : null;
    case 'order':
      return Array.isArray(sol.order) ? sol.order : null;
    case 'build': {
      if (!Array.isArray(sol.slots) || !sol.accept || typeof sol.accept !== 'object') return null;
      const out: Record<number, string> = {};
      for (let i = 0; i < sol.slots.length; i++) {
        const acepta = (sol.accept as Record<string, unknown>)[String(i)];
        const primera = Array.isArray(acepta) ? acepta[0] : acepta;
        if (typeof primera !== 'string' || primera.trim() === '') return null;
        out[i] = primera;
      }
      return out;
    }
    default:
      return null;
  }
}

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
    case 'build':
      return !!answer && typeof answer === 'object' &&
             (sol.slots ?? []).every((_k, i) => {
               const v = (answer as Record<number, unknown>)[i];
               return typeof v === 'string' && v.trim().length > 0;
             });
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

/** What the client MAY see. */
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
    solved: !!best,
    attempts: best?.attempts ?? 0,
  };
}
