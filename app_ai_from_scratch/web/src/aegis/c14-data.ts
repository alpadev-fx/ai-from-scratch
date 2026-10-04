// 14 · PRECIO, «rodar»: where the pieces of the price's roll stand in time and in space. Pure (no window, no document): the effect (src/aegis/fx/c14.ts), the guard tests and the copy-check all read this
// one file, so they cannot disagree.
//
// What the chapter draws: the published price (the page's own figure, «$39.990» or «39,990 COP») is made by its REAL o200k tokens (src/data/v3-tokens.json), each in a square chip laid over its own
// characters (a symbol's chip holds the token's own text, a leading space included: it is the figure's own space, so the text stands on the figure's glyphs in any browser). When the figure comes up the
// screen the chips come in (the symbols in them, the numeric ones EMPTY) and the digits of every numeric token rise into their chips, left to right, each on a wheel of ONE row: its own digit, which slides up
// from below its one-row window into the window, over the figure's own digit. The wheels stop, the price stands as its tokens for a moment, and the real figure comes in underneath the chips, which fade
// away: the figure is the page's own text and is what the reader ends with. Next to it the 30 segments of the bar light up one after the other, a day each. The page's text is never changed and never
// typed here: the markup is the finished picture.
//
// THE HARD RULE of the price: no currency amount other than the published one is ever legible, at any frame. So a wheel never carries a digit that is not the price's own at its place (no 0 to 9 strip that
// rolls past other figures, no rest state on zeros): it shows its own digit, or nothing. c14-frames.mjs reads every frame of the play and fails on any other digit in a wheel's window (h4).
//
// The contract's node counter (v3-fps --nodes) counts every element a chapter ADDS (descendants included) and every element it writes a style on: the layer, one chip per token, one column and one strip
// per digit, the figure and the 30 segments.

/** Seconds. Every picture of the roll is a pure function of the second it is at (the harness seeks it). */
export const T = {
  pop: 0.18,                                                         // the overlay (the price as its tokens, in their chips, the numeric ones empty) comes in over this long
  spin: 0.7,                                                         // a wheel's rise: ONE row, from below its window up to its own digit, an ease out
  cascade: 0.12,                                                     // between one wheel's setting off and the next one's, left to right
  hold: 0.5,                                                         // the wheels have stopped: the price stands as its tokens
  swap: 0.06,                                                        // the real figure comes in underneath the chips, which are still whole
  dissolve: 0.4,                                                     // the chips fade away over the figure
  seg: 0.22,                                                         // a segment of the bar lights up over this long
  segLead: 0.1,                                                      // the first segment starts this long after the wheels' first setting off
  segGap: 0.03,                                                      // between one segment and the next
} as const;

/** The segments of the bar, one per day of the plan. */
export const SEGS = 30;
/** Em of room above and below the figure's line box in a chip (the «$» stands a little taller than the digits; less than the gap to the line under the figure, 6px, at every size). */
export const PAD = 0.07;
/** The contract's allowance of nodes a chapter may write a style on or add. */
export const NODE_BUDGET = 80;
/** The layer, one chip per token, one column and one strip per wheel, the figure and the segments. */
export const nodeCount = (chips: number, wheels: number, segs: number) => 1 + chips + 2 * wheels + 1 + segs;

/** A piece of the figure, as the token file has it: its text, then its ids. */
export type Piece = readonly [text: string, ...ids: number[]];

export interface Token {
  text: string;
  /** Where it stands in the figure's text: [start, end) in UTF-16 units (a leading space included). */
  start: number;
  end: number;
  /** The digit values of a numeric token, in order; empty for a symbol («$», «.», «,», « COP»). */
  digits: number[];
}

/** The tokens of the figure, from its real pieces. Fail closed: no token is an error. */
export function tokensOf(pieces: readonly Piece[]): Token[] {
  if (!pieces.length) throw new Error('c14: the price has at least one token');
  let at = 0;
  return pieces.map(([text]) => {
    const start = at; at += text.length;
    return { text, start, end: at, digits: /^\d+$/.test(text) ? [...text].map(Number) : [] };
  });
}

export interface Wheel {
  /** The token it belongs to, the character it stands over (an offset in the figure's text) and the digit it stops on. */
  token: number;
  at: number;
  digit: number;
  /** The second it sets off and the second it has stopped. */
  start: number;
  stop: number;
}

/** The wheels, left to right: one per digit of a numeric token. */
export const wheelsOf = (tokens: readonly Token[]) => tokens.flatMap((tk, token) => tk.digits.map((digit, j) => ({ token, at: tk.start + j, digit })));

/** The ONE row a wheel carries: its own digit, and nothing else (a digit that is not the price's is a figure that is not the price). Fail closed: a value that is not a digit is an error. */
export const face = (digit: number): number => {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) throw new Error(`c14: ${digit} is not a digit`);
  return digit;
};

export interface Plan {
  wheels: Wheel[];
  /** The second each segment of the bar begins to light up. */
  seg: number[];
  /** The second the last wheel has stopped, the second the real figure begins to come in, the second the chips begin to fade, and the second the roll is done. */
  rest: number;
  swapAt: number;
  fadeAt: number;
  end: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** The schedule. Fail closed: a price with no digit has nothing to roll, and a bar with no segment is not the bar. */
export function plan(tokens: readonly Token[], segs: number): Plan {
  const ws = wheelsOf(tokens);
  if (!ws.length) throw new Error('c14: a price with no digit has nothing to roll');
  if (!Number.isInteger(segs) || segs < 1) throw new Error(`c14: the bar has ${segs} segments`);
  const wheels = ws.map((w, k): Wheel => ({ ...w, start: T.pop + k * T.cascade, stop: T.pop + k * T.cascade + T.spin }));
  const rest = Math.max(...wheels.map((w) => w.stop)), swapAt = rest + T.hold, fadeAt = swapAt + T.swap;
  return { wheels, seg: Array.from({ length: segs }, (_, j) => T.pop + T.segLead + j * T.segGap), rest, swapAt, fadeAt, end: Math.max(fadeAt + T.dissolve, T.pop + T.segLead + (segs - 1) * T.segGap + T.seg) };
}

/** How far below its window wheel k still is at second x, in rows: 1 until it sets off (its row lies entirely under the window: nothing of it is seen), 0 once it has stopped (its digit is in the window, over
 *  the figure's own), an ease out in between (the quickest it goes is 3 rows over T.spin: under a tenth of a row a frame at 60 fps, it never jumps). It is never anywhere but between its own row and the one under it. */
export const below = (p: Plan, k: number, x: number) => 1 - easeOut(clamp01((x - p.wheels[k]!.start) / T.spin));
/** The opacity of the overlay (the chips and their wheels): in over T.pop, whole until the real figure is under it, then away over T.dissolve. */
export const overlay = (p: Plan, x: number) => smooth(clamp01(x / T.pop)) * (1 - smooth(clamp01((x - p.fadeAt) / T.dissolve)));
/** The opacity of the real figure: nothing until the wheels have stopped and the price has stood, then in over T.swap, under the chips. */
export const figure = (p: Plan, x: number) => clamp01((x - p.swapAt) / T.swap);
/** The opacity of segment j. */
export const seg = (p: Plan, j: number, x: number) => smooth(clamp01((x - p.seg[j]!) / T.seg));

export interface Geo {
  /** The figure's box: where its line box stands from the layer's corner (top, px), its height and its font size. */
  fig: { y: number; h: number; fs: number };
  /** Where each token's characters stand: the left of its first and the right of its last (px from the layer's corner). */
  tok: ReadonlyArray<{ l: number; r: number }>;
  /** Where each wheel's digit stands: its left and right. */
  dig: ReadonlyArray<{ l: number; r: number }>;
}

export interface Boxes {
  /** Each chip's outer box (a 1px hairline border inside it, so it is the token's characters plus that border on both sides) and the padding on top that sets its text on the figure's line. */
  chips: Array<{ x: number; y: number; w: number; h: number; pad: number }>;
  /** Each wheel's column: the top-left of its one-row window. */
  cols: Array<{ x: number; y: number }>;
}

/** Where the chips and the columns stand, from where the figure's characters stand. Fail closed: geometry that does not describe every token and wheel, or a number that is not finite, is an error. */
export function boxes(tokens: readonly Token[], g: Geo): Boxes {
  const wheels = wheelsOf(tokens), fin = (v: number) => Number.isFinite(v);
  if (g.tok.length !== tokens.length || g.dig.length !== wheels.length) throw new Error(`c14: the geometry describes ${g.tok.length} tokens and ${g.dig.length} digits for ${tokens.length} tokens and ${wheels.length} wheels`);
  if (![g.fig.y, g.fig.h, g.fig.fs].every(fin) || !(g.fig.h > 0 && g.fig.fs > 0) || g.tok.some((t) => !fin(t.l) || !fin(t.r) || !(t.r > t.l)) || g.dig.some((d) => !fin(d.l) || !fin(d.r) || !(d.r > d.l))) throw new Error('c14: a box, a place or a size is not a number');
  const pad = PAD * g.fig.fs;
  return {
    chips: g.tok.map((t) => ({ x: t.l - 1, y: g.fig.y - pad - 1, w: t.r - t.l + 2, h: g.fig.h + 2 * pad + 2, pad })),
    cols: g.dig.map((d) => ({ x: d.l, y: g.fig.y })),
  };
}
