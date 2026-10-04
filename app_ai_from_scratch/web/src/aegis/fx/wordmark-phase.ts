// When each runner of the footer wordmark is on its contour: a pure function of the contours' lengths, so a test can prove what the page promises (lines are ALWAYS running somewhere on
// the mark; a pulse that leaves the mark empty between laps is the defect the AEGIS footer has, and the one this replaces).
//
// Every contour of every letter has a runner of its own: one dash on a pattern of period P = KU longest contours, lapped once per LAP seconds. The dash is on its contour while it
// has not run off the contour's end, so a contour of length c is lit for a window of LAP * c / P seconds of each lap and dark for the rest. The windows are laid end to end around the
// lap, in a fixed scattered order (so the mark does not sweep from left to right): together they cover the lap S = sum(c) / P times, which is why at every instant floor(S) or ceil(S)
// contours are lit. Nothing here is random, and nothing depends on the size of the mark: the lengths are ratios.
//
// No imports: web/test/v3-guard.test.mts loads this file with plain Node.
export const KU = 1.7;           // the pattern, in longest contours (a pattern longer than the longest contour: one dash at a time on a contour)
export const LAP = 4.5;          // seconds one lap of the pattern takes

export interface Lap {
  /** Second of the lap at which each contour's runner enters it (0 <= start < LAP). */
  starts: number[];
  /** How many seconds of the lap each contour is lit. */
  windows: number[];
  /** S: how many times the windows cover the lap; at every instant floor(S) or ceil(S) contours are lit. */
  cover: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function lap(lc: readonly number[], ku = KU, seconds = LAP): Lap {
  const n = lc.length, p = ku * Math.max(...lc);
  const windows = lc.map((c) => (seconds * c) / p);
  const step = gcd(7, n) === 1 ? 7 : 1;                                   // a fixed shuffle that spreads neighbours apart (7 is coprime with 18, the mark's contours)
  const starts = new Array<number>(n);
  let at = 0;
  for (let j = 0; j < n; j++) { const i = (j * step + 3) % n; starts[i] = at % seconds; at += windows[i]; }
  return { starts, windows, cover: lc.reduce((a, c) => a + c, 0) / p };
}

/** How many contours are lit at second t (any t: the lap repeats). */
export const lit = (l: Lap, t: number, seconds = LAP) => l.starts.filter((s, i) => (((t - s) % seconds) + seconds) % seconds < l.windows[i]).length;
