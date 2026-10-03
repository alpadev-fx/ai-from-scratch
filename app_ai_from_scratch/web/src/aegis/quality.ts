// The engine's quality ratchet. DOWN ONLY: a visit that cannot hold the frame rate gives up, one step at a time, what costs the most for the least that anybody sees, and never takes it
// back (a ratchet that also went up would oscillate on the edge of what the device can do, and that is a stutter of its own). Pure: no window, no document, no clock. The engine feeds it
// the time each drawn frame took; the guard tests feed it recorded and made-up sequences.
//
// The ladder, in this order:
//   pr125  the pixel ratio of the canvas 1.5 -> 1.25   (every full-screen pass touches 31 % fewer pixels)
//   pr100  1.25 -> 1.0                                  (and 36 % fewer again)
//   blur   the directional motion blur                  (7 taps of the finishing pass, only while the page is scrolling fast)
//   ca     the chromatic aberration                     (3 taps)
//   bloom  the halo: the bright pass and its six blur passes
// A step that would do nothing on this device is not a step: a 1x screen has no pixel ratio to give, so its ladder starts at `blur`.
//
// When it steps: over the last `win` drawn frames, the average took more than `avgMs` (a device that sits at 48 fps), or `slowShare` of them took more than `slowMs` (one frame in
// eight is dropped). A single hitch (a decode, a GC) moves neither number: it is one slow frame, and it counts at most `clipMs` in the average. After a step the history is cleared and the next `settle` frames are not looked at: the resize of the render
// targets is itself a hitch, and the new level has to be judged on its own. Nothing is judged in the first `warm` frames either (the shaders compile and the first textures upload then).
// A gap longer than `stallMs` between two drawn frames is a pause (a hidden tab, a debugger), not the device: it clears the history and counts for nothing.
export type Step = 'pr125' | 'pr100' | 'blur' | 'ca' | 'bloom';
export const LADDER: readonly Step[] = ['pr125', 'pr100', 'blur', 'ca', 'bloom'];
export const WHAT: Record<Step, string> = {
  pr125: 'pixel ratio 1.25', pr100: 'pixel ratio 1', blur: 'motion blur off', ca: 'chromatic aberration off', bloom: 'bloom off',
};

export interface RatchetOpts { win?: number; every?: number; slowMs?: number; slowShare?: number; avgMs?: number; clipMs?: number; settle?: number; warm?: number; stallMs?: number }
export const DEFAULTS = { win: 60, every: 15, slowMs: 24, slowShare: 0.13, avgMs: 20, clipMs: 100, settle: 90, warm: 90, stallMs: 1000 } as const;

export interface Ratchet {
  /** One frame was drawn and `ms` passed since the previous drawn one. Returns the step to take NOW (at most one), or null. */
  frame(ms: number): Step | null;
  /** The steps taken so far, in order. */
  readonly taken: readonly Step[];
  /** Every step of this device's ladder has been taken: nothing is left to give up. */
  readonly done: boolean;
  /** How many steps this device's ladder has in all. */
  readonly size: number;
}

export function createRatchet(pr0: number, o: RatchetOpts = {}): Ratchet {
  const c = { ...DEFAULTS, ...o };
  const ladder = LADDER.filter((s) => (s === 'pr125' ? pr0 > 1.25 + 1e-9 : s === 'pr100' ? pr0 > 1 + 1e-9 : true));
  const taken: Step[] = [], ring: number[] = [];
  let at = 0, skip = c.warm, since = 0;
  return {
    get taken() { return taken; },
    get done() { return at >= ladder.length; },
    get size() { return ladder.length; },
    frame(ms) {
      if (at >= ladder.length || !(ms >= 0)) return null;           // nothing left to give up, or not a time (NaN, negative)
      if (ms > c.stallMs) { ring.length = 0; since = 0; return null; }
      if (skip > 0) { skip--; return null; }
      ring.push(ms); if (ring.length > c.win) ring.shift();
      if (ring.length < c.win || ++since < c.every) return null;
      since = 0;
      let sum = 0, slow = 0; for (const v of ring) { sum += Math.min(v, c.clipMs); if (v > c.slowMs) slow++; }   // a frame counts at most `clipMs` in the average: one hitch does not make a slow device
      if (sum / ring.length <= c.avgMs && slow / ring.length < c.slowShare) return null;
      const s = ladder[at++]; taken.push(s); ring.length = 0; skip = c.settle;
      return s;
    },
  };
}
