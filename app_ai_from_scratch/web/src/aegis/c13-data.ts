// 13 · PARA QUIÉN, «separar»: where the pieces of the sorting stand in time and in space. Pure (no window, no document): the effect (src/aegis/fx/c13.ts), the guard tests and the copy-check all read this
// one file, so they cannot disagree.
//
// What the chapter draws: the two lists of the chapter (the four lines of «Es para ti si» and the three of «No es para ti si», the page's own copy) are first a pile: the REAL o200k tokens of all seven lines
// (src/data/v3-tokens.json, a leading space shown as «·»), jumbled together, the tokens of the two lists mixed (the ones of the yes list outlined in the accent, the ones of the no list plain). When the
// chapter comes into view the pile forms in the middle of it, stands for a moment, and then separates: each token runs to the place of its own words, the yes tokens into the yes column and the no tokens
// into the no column, the lines nearest the pile first. A line's words come in as its tokens arrive and the chips are gone. The page's text is never changed and never typed here: the markup is the finished
// picture and the real lines are what the reader ends with.
//
// The tokens travel in UNITS, runs of up to CAP (two) tokens, cut at word boundaries: there are 91 (ES) and 85 (EN) real tokens in the seven lines, and the contract allows a chapter 80 nodes. Its counter
// (v3-fps --nodes) counts every element a chapter ADDS, descendants included, and every element it writes a style on, so 91 chip elements are 91 nodes before a single unit is counted. A unit is ONE
// element and its chips are that element's two pseudo-elements (::before and ::after, the text of each in a data attribute): two chips side by side (3 px apart) that run together, and no node of their own.

/** Chips a unit holds at most: the two pseudo-elements of its element (::before, ::after). A word of more tokens than that is cut into runs of CAP, the only place a word is cut. */
export const CAP = 2;

/** Seconds and px. Every picture of the sorting is a pure function of the second it is at (the harness seeks it). */
export const T = {
  form: 0.32,                                                        // the pile forms: its units come in over this long, one after another, in the pile's own order
  pop: 0.14,                                                         // each unit fades in over this long
  hold: 0.22,                                                        // the pile stands, mixed, before it separates
  fly: 0.62,                                                         // every unit's run, from the pile to its words
  unit: 0.03,                                                        // between one unit of a line and the next one, in the order the line reads
  item: 0.11,                                                        // between one line and the next, the one nearest the pile first
  fade: 0.2,                                                         // a unit fades out around the second it arrives
  text: 0.2,                                                         // a line's words begin to come in this long before its first unit arrives
} as const;

/** The nodes the contract's counter (v3-fps --nodes) finds in a whole pass: every element the effect adds (the layer, one per unit: a unit's chips are pseudo-elements, no element) and every element it
 *  writes a style on (the units, and one per line's text). The contract allows 80 for a chapter. */
export const NODE_BUDGET = 80;
export const nodeCount = (units: number, items: number) => units + items + 1;

export interface UnitSpec {
  /** The line it belongs to (0 .. items - 1, in the order the lines are listed: the yes list first, then the no list). */
  item: number;
  /** Chips in it (1 .. CAP: its pseudo-elements). */
  chips: number;
  /** The list it comes from (it only tells the effect which outline to give it: yes in the accent, no plain). */
  list: 'yes' | 'no';
}

/** A piece of a line, as the token file has it: its text, then its ids. */
export type Piece = readonly [text: string, ...ids: number[]];

export interface Unit {
  /** Index of its first and last piece in the line. */
  first: number;
  last: number;
  chips: number;
  /** Where its words stand in the line's text: [start, end) in UTF-16 units, the leading space of its first token left out (the space is not drawn). */
  start: number;
  end: number;
}

/** The words of a line: the index in the line of each word's first and last piece. A piece that starts with a space, or the first one, opens a new word; punctuation sticks to the word before it
 *  (the same rule as tokens.ts wordsOf: the guard test holds them equal). */
function wordsOf(pieces: readonly Piece[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  pieces.forEach(([t], i) => { if (i === 0 || t.startsWith(' ')) out.push([i, i]); else out[out.length - 1]![1] = i; });
  return out;
}

/** The units of one line: its tokens in reading order, cut at word boundaries into runs of at most CAP tokens; a word of more tokens than that is cut into runs of CAP (a unit never holds more chips than it
 *  has pseudo-elements). Fail closed: no tokens is an error. */
export function unitsOf(pieces: readonly Piece[]): Unit[] {
  if (!pieces.length) throw new Error('c13: a line has at least one token');
  const off: number[] = [0]; pieces.forEach(([t]) => off.push(off[off.length - 1]! + t.length));
  const out: Unit[] = [];
  let cur: [number, number] | null = null;
  const push = () => {
    if (!cur) return;
    const [a, b] = cur; out.push({ first: a, last: b, chips: b - a + 1, start: off[a]! + (pieces[a]![0].startsWith(' ') ? 1 : 0), end: off[b + 1]! }); cur = null;
  };
  for (const [a, b] of wordsOf(pieces)) {
    if (b - a + 1 > CAP) {                                           // a word of more tokens than a unit holds: it closes the unit in progress and is cut into runs of CAP
      push();
      for (let i = a; i <= b; i += CAP) { cur = [i, Math.min(b, i + CAP - 1)]; push(); }
      continue;
    }
    if (cur && b - cur[0] + 1 > CAP) push();
    cur = cur ? [cur[0], b] : [a, b];
  }
  push();
  return out;
}

export interface Geo {
  /** Where the pile is and how far its units are spread: the centre and half-width/-height, px, from the layer's own corner. */
  pile: { x: number; y: number; hx: number; hy: number };
  /** Each unit's box (px). */
  box: ReadonlyArray<{ w: number; h: number }>;
  /** Where each unit's box stands (its top-left corner, px from the layer's corner) once it has arrived at its words. */
  rest: ReadonlyArray<{ x: number; y: number }>;
  /** How far each line's text is from the pile (px): the nearest line goes first. */
  dist: readonly number[];
}

export interface Plan {
  /** Where each unit's box is in the pile (top-left) and where it comes to rest. */
  from: Array<[number, number]>;
  to: Array<[number, number]>;
  /** The second each unit begins to come into the pile, begins to run, and arrives. */
  appear: number[];
  rel: number[];
  land: number[];
  /** Each line's text: the second it begins to come in and the second it is whole. */
  text: Array<[number, number]>;
  /** Each line's turn (0 = the line nearest the pile, which goes first). */
  rank: number[];
  /** The pile's own order, bottom first: a permutation of the units. The units are made in this order, so it is also the pile's stacking. */
  order: number[];
  /** The second the effect lets go: the last unit has arrived and gone, the last line is whole. */
  end: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The pile's seed. A Lehmer generator: its arithmetic is exact in doubles, so every engine draws the same pile. */
export const PILE_SEED = 13;
function lehmer(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** The pile: each unit's place in it (u, v in -1..1, inside the unit disc) and the order the units are stacked and come in (a shuffle that has nothing to do with the line or the list: the lists are mixed). */
export function pileOf(n: number) {
  const r = lehmer(PILE_SEED), uv: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) { let u = 0, v = 0; do { u = 2 * r() - 1; v = 2 * r() - 1; } while (u * u + v * v > 1); uv.push([u, v]); }
  const order = Array.from({ length: n }, (_, k) => k);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
  return { uv, order };
}

/** The schedule. `specs` lists the units in reading order (line 0 first, a line's units in the order it reads). Fail closed: no units, lines that do not count up from 0 one at a time, a unit with no chip or with more than CAP,
 *  geometry that does not describe every unit and every line, or a number that is not finite, are errors. */
export function plan(specs: readonly UnitSpec[], g: Geo): Plan {
  const n = specs.length;
  if (!n) throw new Error('c13: there are units to sort');
  let items = 0;
  specs.forEach((s, k) => {
    if (!Number.isInteger(s.chips) || s.chips < 1 || s.chips > CAP) throw new Error(`c13: unit ${k} has ${s.chips} chips, a unit holds 1 to ${CAP} (its pseudo-elements)`);
    if (k === 0 ? s.item !== 0 : s.item !== specs[k - 1]!.item && s.item !== specs[k - 1]!.item + 1) throw new Error(`c13: unit ${k} is in line ${s.item}, the lines count up from 0 one at a time`);
    items = s.item + 1;
  });
  const fin = (v: number) => Number.isFinite(v);
  if (g.box.length !== n || g.rest.length !== n || g.dist.length !== items) throw new Error(`c13: the geometry describes ${g.box.length} boxes, ${g.rest.length} places and ${g.dist.length} lines for ${n} units in ${items} lines`);
  if (!(g.pile.hx > 0 && g.pile.hy > 0) || ![g.pile.x, g.pile.y, g.pile.hx, g.pile.hy].every(fin)) throw new Error('c13: the pile has no size or no place');
  if (g.box.some((b) => !(b.w > 0 && b.h > 0) || !fin(b.w) || !fin(b.h)) || g.rest.some((r) => !fin(r.x) || !fin(r.y)) || g.dist.some((d) => !fin(d))) throw new Error('c13: a box, a place or a distance is not a number');

  const { uv, order } = pileOf(n);
  const rank = Array.from({ length: items }, (_, i) => i).sort((a, b) => g.dist[a]! - g.dist[b]! || a - b).reduce((r, item, pos) => { r[item] = pos; return r; }, new Array<number>(items));
  const within = new Array<number>(n), seen = new Array<number>(items).fill(0);
  specs.forEach((s, k) => { within[k] = seen[s.item]!++; });
  const pos = new Array<number>(order.length); order.forEach((k, i) => { pos[k] = i; });

  const from: Array<[number, number]> = [], to: Array<[number, number]> = [], appear: number[] = [], rel: number[] = [], land: number[] = [];
  for (let k = 0; k < n; k++) {
    from.push([g.pile.x + uv[k]![0] * g.pile.hx - g.box[k]!.w / 2, g.pile.y + uv[k]![1] * g.pile.hy - g.box[k]!.h / 2]);
    to.push([g.rest[k]!.x, g.rest[k]!.y]);
    appear.push(n > 1 ? (pos[k]! / (n - 1)) * (T.form - T.pop) : 0);
    rel.push(T.form + T.hold + rank[specs[k]!.item]! * T.item + within[k]! * T.unit);
    land.push(rel[k]! + T.fly);
  }
  const first = new Array<number>(items).fill(Infinity), lastL = new Array<number>(items).fill(-Infinity);
  specs.forEach((s, k) => { first[s.item] = Math.min(first[s.item]!, land[k]!); lastL[s.item] = Math.max(lastL[s.item]!, land[k]!); });
  const text = first.map((f, i): [number, number] => [f - T.text, lastL[i]! + T.fade / 2]);
  const end = Math.max(...land.map((l) => l + T.fade / 2), ...text.map((t) => t[1]));
  return { from, to, appear, rel, land, text, rank, order, end };
}

/** How unit k stands at second x: the top-left corner of its box and its opacity. It comes into the pile (0 -> 1 over T.pop), waits there, runs to its place (an ease in and out) and fades out around the second it arrives. */
export function unit(p: Plan, k: number, x: number) {
  const e = smooth(clamp01((x - p.rel[k]!) / T.fly)), [fx, fy] = p.from[k]!, [tx, ty] = p.to[k]!;
  const pop = clamp01((x - p.appear[k]!) / T.pop), out = smooth(clamp01((x - (p.land[k]! - T.fade * 0.6)) / T.fade));
  return { x: fx + (tx - fx) * e, y: fy + (ty - fy) * e, a: pop * (1 - out) };
}

/** How whole line i's text is at second x (the words come in as the line's units arrive). */
export const text = (p: Plan, i: number, x: number) => smooth(clamp01((x - p.text[i]![0]) / (p.text[i]![1] - p.text[i]![0])));
