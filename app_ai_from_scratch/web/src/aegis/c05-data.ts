// Chapter 05's drawings (web/src/components/V3Viz.astro renders their final pictures, web/src/aegis/fx/c05v.ts plays them): the numbers they are drawn from. Pure (no window, no document):
// the page, the guard tests and the copy-check read the same functions.
// A drawing that carries a number of its card's published figure reads it FROM the figure, so the picture can never disagree with the card it sits on: a figure that changes shape stops
// the render (like a stale price does) instead of drawing something else. Everything else a drawing shows (the other options of a bar, the angle of a dial, the height of a weight) is a
// drawing, and the card says so: every drawing carries ILUSTRATIVO.

/** The drawing of each of the six cards, in order. Card 5 («3 palabras = 4 tokens», the real o200k count of its sentence by the owner's decision of 2026-10-04; it
 *  read 5 before) has none yet. It stays the static card it was until a drawing is made for it. */
export const VIZ = ['eg', 'curve', 'dials', 'freeze', null, 'stack'] as const;
export type VizKind = Exclude<(typeof VIZ)[number], null>;

/** The integers of a published figure, in order: «94 → 23 → 4» is [94, 23, 4], «31 de 100» is [31, 100]. */
export const figureInts = (k: string): number[] => (k.match(/\d+/g) ?? []).map(Number);

/** A repeatable stand-in for random: the same drawing on every render and in every language. */
const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- 02 · «94 → 23 → 4»: the error falling with practice ----------
export const CURVE = { w: 376, h: 96, base: 90, top: 10, xs: [0.03, 0.5, 0.97] } as const;   // the drawing's own units; the three points sit at these fractions of its width

/** The three values of the figure and the path through them. 100 is the top of the drawing and 0 its axis; the curve falls steeply first and settles, like the lesson says it does. */
export function curveOf(k: string) {
  const v = figureInts(k);
  if (v.length !== 3 || v.some((n) => !(n >= 0 && n <= 100)) || !(v[0] > v[1] && v[1] > v[2])) throw new Error(`v3 chapter 05: «${k}» is not three falling values between 0 and 100: the error curve cannot be drawn from it`);
  const y = (n: number) => +(CURVE.top + (1 - n / 100) * (CURVE.base - CURVE.top)).toFixed(2);
  const pts = v.map((n, i) => ({ v: n, x: CURVE.xs[i], y: y(n) }));
  const X = (f: number) => +(f * CURVE.w).toFixed(1), [a, b, c] = pts;
  // out of the first point steeply, flat into the second; out of the second flat (S repeats the control point mirrored: the joint is smooth), flat into the third
  const d = `M${X(a.x)} ${a.y} C${X(a.x + 0.1)} ${+(a.y + 0.78 * (b.y - a.y)).toFixed(2)} ${X(b.x - 0.22)} ${b.y} ${X(b.x)} ${b.y} S${X(c.x - 0.2)} ${c.y} ${X(c.x)} ${c.y}`;
  return { pts, d };
}

// ---------- 06 · «31 de 100»: the options of the next token add up to 100 ----------
const REST = [22, 16, 11, 8, 6, 4, 2];                              // the other seven options, as they are drawn when the figure is 31 (they add up to 69)

/** The eight widths of the stacked bar, in percent: the first is the figure's own number, the others share what is left in the proportions of REST (largest remainder, none under 1). They add up to 100. */
export function stackOf(k: string): number[] {
  const v = figureInts(k);
  if (v.length !== 2 || v[1] !== 100 || !(v[0] >= 1 && v[0] <= 100 - REST.length)) throw new Error(`v3 chapter 05: «${k}» is not «N of 100»: the stacked bar cannot be drawn from it`);
  const rest = 100 - v[0], total = REST.reduce((x, y) => x + y, 0), raw = REST.map((w) => (w * rest) / total), w = raw.map((x) => Math.max(1, Math.floor(x)));
  let left = rest - w.reduce((x, y) => x + y, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  for (let i = 0; left !== 0; i = (i + 1) % order.length) { const j = order[i][1]; if (left > 0) { w[j]++; left--; } else if (w[j] > 1) { w[j]--; left++; } }
  return [v[0], ...w];
}

// ---------- 03 · «70.000.000.000»: a grid of dials ----------
export const DIALS = { cols: 8, rows: 3 } as const;
/** The angle each dial rests at, in degrees from straight up (-130 to 130). */
export const dialAngles = (): number[] => Array.from({ length: DIALS.cols * DIALS.rows }, (_, i) => Math.round((rand(i + 1) * 2 - 1) * 130));

// ---------- 04 · «1 vez»: weights that are trained once and then frozen ----------
export const WEIGHTS = 12, ANSWERS = 5;
/** The height of each weight when it is frozen, as a share of the box (0.3 to 1). */
export const weightHeights = (): number[] => Array.from({ length: WEIGHTS }, (_, i) => +(0.3 + 0.7 * rand(i + 40)).toFixed(2));

// ---------- 01 · «100.000»: examples going in ----------
/** The four examples still waiting in the queue: where the small square of each «photo» sits, in percent of the tile. */
export const TILES: ReadonlyArray<readonly [number, number]> = [[20, 28], [50, 16], [28, 46], [46, 36]];

// ---------- the clock of each drawing (seconds), read by fx/c05v.ts and by the guard test: every drawing is done within 2.5 s of its card coming in ----------
export const T = {
  eg: { n: 5, queue: 4, first: 0.05, gap: 0.17, cross: 0.8, sink: 0.16, arrive: 0.7 },        // tiles that go in, tiles that wait, first start, between tiles, crossing, sinking into the slot, a waiting tile's trip
  curve: { t0: 0.15, dur: 1.5, fade: 0.25 },                                                   // start, reveal, the scan line's fade
  dials: { a0: 0.05, dx: 0.06, dy: 0.03, turn: 0.55, lag: 0.95, settle: 0.5 },                 // start, delay per column and per row, first turn, wait for the second wave, settling turn
  freeze: { train: 1.05, sweep: 0.55, lock: 0.17, a0: 1.4, agap: 0.07, adur: 0.5 },           // training, the sweep that locks the weights, one weight locking, answers: start, gap, trip
  stack: { a0: 0.1, gap: 0.13, dur: 0.32, close: 0.18, sum: 0.5 },                             // first segment, between segments, one segment, wait for the bracket, the bracket
} as const;

/** The nodes each drawing writes a style on in a whole pass (parts it adds while it plays count too), from the same constants the effect reads. The chapter's budget is 80 with the pinned track's own
 *  nine (its track, the six figures, the rail and its thumb), which c05.ts owns. */
export const NODES = {
  eg: T.eg.n + 1 + T.eg.queue,                                                                  // the tiles that go in, the slot's fill, the tiles that wait
  curve: 1 + 3 + 1,                                                                              // the clip, the three points, the scan line
  dials: DIALS.cols * DIALS.rows,
  freeze: WEIGHTS + ANSWERS + 1,                                                                 // the weights, the answers, the sweep line
  stack: 8 + 1 + 1,                                                                              // the segments, the ruler, the bracket
} as const;
export const TRACK_NODES = 9, NODE_BUDGET = 80;

/** When each drawing is finished, in seconds from the moment its card comes in. */
export const END = {
  eg: T.eg.first + (T.eg.n + T.eg.queue - 1) * T.eg.gap + T.eg.arrive,
  curve: T.curve.t0 + T.curve.dur + T.curve.fade,
  dials: T.dials.a0 + (DIALS.cols - 1) * T.dials.dx + (DIALS.rows - 1) * T.dials.dy + T.dials.lag + T.dials.settle,
  freeze: T.freeze.a0 + (ANSWERS - 1) * T.freeze.agap + T.freeze.adur,
  stack: T.stack.a0 + 7 * T.stack.gap + T.stack.close + T.stack.sum,                           // 8 segments: 7 gaps after the first
} as const;
