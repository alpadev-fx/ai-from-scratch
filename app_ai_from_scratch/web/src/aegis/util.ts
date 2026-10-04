// Pure helpers. No window/document at module scope (SSR-safe).
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** `cur` moved toward `target` by at most `step` (never past it). */
export const toward = (cur: number, target: number, step: number) => cur + clamp(target - cur, -step, step);
/** A value that follows its target one step per RENDERED frame: `cur` (negative until it has a value, so for values that are never negative) and `frame`, the frame of its last move. */
export interface Follow { cur: number; frame: number }
/** One call of a follower (row A's padding in chapter 04). It starts AT its target; it arrives at once when `snap` (a forced review jump, __v3Go: its ticks paint no frame of their own, so they can never
 *  move it a step per frame, and a picture would show however far the frames that happened to run before it had got); otherwise it moves toward the target by at most `step`, on the first call of each rendered
 *  `frame` only. Returns the new value. */
export const followStep = (s: Follow, target: number, step: number, frame: number, snap: boolean) => {
  if (s.cur < 0 || snap) s.cur = target; else if (frame !== s.frame) { s.frame = frame; s.cur = toward(s.cur, target, step); }
  return s.cur;
};
/** The light of a soft sprite by its distance d from the centre (0 at the centre, 1 at the edge): 1 at the centre, 0.8 at `hard`, 0 at the edge. These are the stops of the radial gradient the page's glows use. */
export const glowAlpha = (d: number, hard: number) => (d >= 1 ? 0 : d <= hard ? 1 - 0.2 * (d / hard) : 0.8 * (1 - (d - hard) / (1 - hard)));
/** The same light with a SQUARE falloff, for x, y in -1..1: the distance is the Chebyshev one, max(|x|, |y|), so the glow dies out along the sides of a square and not along a circle. */
export const squareGlow = (x: number, y: number, hard: number) => glowAlpha(Math.max(Math.abs(x), Math.abs(y)), hard);
/** A square outline centred on the origin as an indexed triangle list: the outer square of half-side `o` minus the inner one of half-side `i` (8 vertices x, y, z = 0; 8 triangles). */
export const squareFrame = (o: number, i: number) => ({
  pos: new Float32Array([-o, -o, 0, o, -o, 0, o, o, 0, -o, o, 0, -i, -i, 0, i, -i, 0, i, i, 0, -i, i, 0]),
  idx: [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
});
export const seg = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
export const eo = (t: number) => 1 - Math.pow(1 - t, 3);
export const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const ss = (t: number) => t * t * (3 - 2 * t);
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
export const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];
export function el(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e;
}
/** Deterministic PRNG so the scene looks the same on every load. */
export function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
