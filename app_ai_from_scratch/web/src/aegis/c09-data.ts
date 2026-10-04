// 09 · EL TEMARIO, the river: where its pieces stand in time and in space. Pure (no window, no document): the effect (src/aegis/fx/c09.ts), the guard tests and the copy-check all read this one file,
// so they cannot disagree.
//
// What the chapter draws: each lesson of the temario is a row with its title (the real text stays in the HTML and is never changed). When a row comes into view the REAL o200k tokens of its title
// (src/data/v3-tokens.json, a leading space shown as «·») run in from the left edge of the screen along the title's own line, in the order the title reads, all at one speed: a river of tokens.
// The head of the river (the title's last token) comes to rest at its place first and each token behind it comes to rest against the one in front, so the river closes up into the title; the
// title stands as its tokens for a moment and then the chips fade out as the words fade in. The temario's order never changes: nothing moves but those chips, and each lesson has its own
// river, started by its own row, so a reader sees every row arrive and not a wall of them that played before their screen got there. Nothing here is a measurement.

/** Seconds and px/s. Every picture of a row is a pure function of the second it is at (the harness seeks it). */
export const T = {
  lead: 0.04,                                                        // before the head of the river sets off
  speed: 1300,                                                       // px/s every chip runs at
  stop: 0.16,                                                        // a chip slows to a stop over this long (a uniform deceleration: it covers speed * stop / 2)
  pace: 0.07,                                                        // between one chip coming to rest and the next one doing so: the river closes up one chip at a time
  hold: 0.3,                                                         // the title stands as its tokens before it turns into words
  merge: 0.34,                                                       // the chips fade out as the words fade in
  row: 0.1,                                                          // rows that come into view in the same instant start this far apart, the top one first
} as const;

/** The nodes the effect writes a style on or adds in a whole pass: one per chip, one per title (a row's chips are made when the row plays and removed when it is done), and the one layer the chips live in (made
 *  by the first row that plays and kept until every row is done, so a list read row by row does not make a new one for each). The contract allows 80 for a chapter. */
export const NODE_BUDGET = 80;
export const nodeCount = (chips: number, rows: number) => chips + rows + 1;

export interface Plan {
  /** dist[k]: px chip k (in the title's reading order) has to run, from beyond the left edge of the screen to its place. */
  dist: number[];
  /** set[k]: the second chip k sets off. */
  set: number[];
  /** dock[k]: the second chip k has come to rest in its place. */
  dock: number[];
  /** The second the last chip is at rest. */
  last: number;
  /** The second the chips begin to fade out and the title to come in. */
  m0: number;
  /** The second the effect lets go: the title is whole and the chips are gone. */
  end: number;
}

/** How long chip k's run takes: it runs at T.speed and then slows to a stop (the stop covers T.speed * T.stop / 2 of the distance, so the whole takes dist / speed + stop / 2). */
export const flight = (dist: number) => dist / T.speed + T.stop / 2;

/** The schedule for a title whose chips have to run `dist[k]` px (chip 0 is the title's first token). The river comes in with its head, the last token, first; every chip comes to rest `T.pace` after the
 *  one in front of it, and sets off so that it does, so the chips of the river are a constant `speed * pace + gap` apart all the way and close up at their places. Seconds are shifted so the first chip sets
 *  off at `T.lead`. Fail closed: no chips, a distance that is not a number, or one too short for the stop to fit (T.speed * T.stop / 2 px) is an error. */
export function plan(dist: readonly number[]): Plan {
  const min = (T.speed * T.stop) / 2;
  if (!dist.length || dist.some((d) => !Number.isFinite(d) || d <= min)) throw new Error(`c09: a title is at least one chip and every one has more than ${min} px to run, got [${dist.join(',')}]`);
  const n = dist.length, dock: number[] = new Array(n), set: number[] = new Array(n);
  dock[n - 1] = flight(dist[n - 1]!);
  for (let k = n - 2; k >= 0; k--) dock[k] = dock[k + 1]! + T.pace;
  for (let k = 0; k < n; k++) set[k] = dock[k]! - flight(dist[k]!);
  const s0 = T.lead - Math.min(...set);
  for (let k = 0; k < n; k++) { set[k]! += s0; dock[k]! += s0; }
  const last = Math.max(...dock), m0 = last + T.hold;
  return { dist: [...dist], set, dock, last, m0, end: m0 + T.merge };
}

/** The schedule of a title that has no chips (they do not fit on its line without covering the text under it, on the narrowest phones): no chips, the words come in as they do after the chips. */
export const plain: Plan = { dist: [], set: [], dock: [], last: T.lead, m0: T.lead, end: T.lead + T.merge };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** How chip k stands at second x: `r` the px it still has to run to its place (all of its distance while it waits off-screen, 0 once it is at rest) and `a` its opacity (0 while it waits, 1 while it runs
 *  and rests, fading out over the merge). */
export function chip(p: Plan, k: number, x: number) {
  const d = p.dist[k]!, tau = x - p.set[k]!, F = flight(d), S = T.stop;
  const r = tau <= 0 ? d : tau >= F ? 0 : tau <= F - S ? d - T.speed * tau : ((T.speed * S) / 2) * Math.pow((F - tau) / S, 2);   // cruise at one speed, then a uniform stop: tangent where it begins, 0 and at rest where it ends
  return { r, a: tau <= 0 ? 0 : 1 - clamp01((x - p.m0) / (T.merge * 0.7)) };
}

/** How whole the title is at second x: 0 while the chips stand in its place, 1 once the words are back (they come in over the last 70 % of the merge, a little after the chips begin to go). */
export const title = (p: Plan, x: number) => smooth(clamp01((x - (p.m0 + T.merge * 0.3)) / (T.merge * 0.7)));

/** Where the chips of one title stand once they are at rest: laid out left to right in the title's box and wrapped at `maxW` (px), `gap` apart and `lineH` between lines. Positions are the chips' top-left
 *  corners relative to the title's top-left corner. A chip wider than the box has a line of its own. */
export function wrap(widths: readonly number[], maxW: number, gap: number, lineH: number) {
  let x = 0, line = 0;
  const pos = widths.map((w) => {
    if (x > 0 && x + w > maxW + 0.5) { x = 0; line++; }
    const at = [x, line * lineH] as [number, number]; x += w + gap; return at;
  });
  return { pos, lines: line + 1, h: (line + 1) * lineH };
}
