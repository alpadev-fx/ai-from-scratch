// 07 · EL TIEMPO, the pile: where its pieces stand in time. Pure (no window, no document): the effect (src/aegis/fx/c07.ts), the guard tests and the copy-check all read this one file, so they cannot disagree.
//
// What the chapter draws: the twelve lesson titles as their REAL o200k tokens (src/data/v3-tokens.json, cut by web/scripts/v3-tokens.py), one row of chips per lesson in the course's order (01 at the
// top, 12 at the bottom: the temario's order never changes), and under them the course's own «40 MIN». The markup is the finished picture, the pile as it ends. When the chapter comes into view
// the chips fall into it from the top edge of the pile, the bottom row first and each row on top of the one before (a pile fills from the floor up), left to right inside a row, while the number
// under them runs from 0 to 40 in step with the chips that have landed. Nothing here is a measurement: it is the real tokens of the real titles, and the course's real 40 minutes.

/** One row per lesson. */
export const ROWS = 12;

/** Seconds. Every picture of the pile is a pure function of the second it is at (the harness seeks it). */
export const T = {
  lead: 0.12,                                                        // before the first chip leaves the top edge
  tMax: 0.52,                                                        // the fall to the bottom row; a row's fall is that long times the square root of its depth (free fall: t ~ sqrt(distance))
  step: 0.022,                                                       // between one chip landing and the next one in a row
  gap: 0.035,                                                        // between a row's last landing and the first of the row on top of it
  squash: 0.14,                                                      // a chip that lands squashes by a tenth of its height and recovers
  flash: 0.45,                                                       // the accent outline of a chip that has landed fades over this long
  tail: 0.25,                                                        // everything at rest before the effect lets go
} as const;

/** Seconds a chip takes to fall to row r (0 the top row, ROWS - 1 the bottom one): the rows are one pitch apart, so row r is r + 1 pitches below the top edge. */
export const fall = (r: number) => T.tMax * Math.sqrt((r + 1) / ROWS);

export interface Plan {
  /** land[r][k]: the second chip k (left to right) of row r (0 = the top row) lands. */
  land: number[][];
  /** Every landing, in order (the counter counts them). */
  times: number[];
  /** The second the last chip lands. */
  last: number;
  /** The second the effect lets go: the last landing's outline has faded and everything has rested. */
  end: number;
}

/** The schedule for a pile whose rows hold `ks[r]` chips (r = 0 is the top row): the bottom row first, left to right, then the row on top of it. Fail closed: a pile that is not ROWS rows of at least one chip is an error. */
export function plan(ks: readonly number[]): Plan {
  if (ks.length !== ROWS || ks.some((k) => !Number.isInteger(k) || k < 1)) throw new Error(`c07: the pile is ${ROWS} rows of at least one chip each, got [${ks.join(',')}]`);
  const land: number[][] = ks.map(() => []);
  let t = T.lead + fall(ROWS - 1), last = t;
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let k = 0; k < ks[r]!; k++) { land[r]!.push(t); last = t; t += T.step; }
    t = last + T.gap;
  }
  return { land, times: land.flat().sort((a, b) => a - b), last, end: last + Math.max(T.flash, T.squash) + T.tail };
}

/** How many of the `to` minutes the counter shows at second x: the share of the chips that have landed. The last chip lands on `to`, exactly. */
export function count(p: Plan, x: number, to: number) {
  let n = 0; while (n < p.times.length && p.times[n]! <= x) n++;
  return Math.round((to * n) / p.times.length);
}

/** The nodes the effect writes a style on in a whole pass: one per chip (the counter is an overlay it adds and the pile itself gets no style). The contract allows 80 for a chapter. */
export const NODE_BUDGET = 80;
export const nodeCount = (chips: number) => chips;
