// 12 · QUIÉN, the drawing of the agent loop: what it says, where it stands and how long it plays. Pure (no window, no document): the page's markup (src/components/V3Loop.astro), the effect
// (src/aegis/fx/c12v.ts), the guard tests and the copy-check all read this one file, so they cannot disagree.
//
// What the drawing may say is what the chapter already says. The instructor's closing sentence lists what his harness includes between two dashes («— skills, hooks, agentes, workflows y 9 prompts —»);
// those five terms are the drawing's only words (plus the ILUSTRATIVO tag the page already has), they are READ from that sentence in either language and never typed here, and the number of
// prompt ticks is the sentence's own 9. A sentence that does not have that shape stops the render (loopOf throws), like a stale price does: nothing is drawn from a guess.
//
// The loop: a token goes round a square track and stops at its four corners, one after the other. The drawing does not name those four stops, because their names are not in the copy: it shows
// what the harness is made of, firing as the loop turns. The SKILLS are loaded at the first corner, the HOOKS fire at the second (before and after the work), the prompts light up three by three
// at the third, and the track itself is drawn by the token's first lap. After the last lap a frame closes round the whole loop and says WORKFLOWS. The final picture (the markup) is the loop at
// rest: the track drawn, the token on the first corner, every term in its place, every prompt lit.

export interface Loop { skills: string; hooks: string; agents: string; workflows: string; prompts: string; n: number }

/** The five terms of the closing sentence, in the order it lists them, and the count its last term starts with. Throws when the sentence is not «… — a, b, c, d y N e — …». */
export function loopOf(close: string): Loop {
  const m = /[—–]\s*([^—–]+?)\s*[—–]/.exec(close);
  if (!m) throw new Error('c12: the closing sentence has no «— skills, hooks, … —» list to draw from');
  const parts = m[1].split(/\s*,\s*|\s+(?:y|and)\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 5) throw new Error(`c12: the closing sentence lists ${parts.length} terms between its dashes, the drawing is made of 5 (skills, hooks, agents, workflows, prompts)`);
  const [skills, hooks, agents, workflows, prompts] = parts as [string, string, string, string, string];
  const n = Number(/^(\d+)\s+\S/.exec(prompts)?.[1]);
  if (!(n >= LAPS && n <= 12 && Number.isInteger(n))) throw new Error(`c12: «${prompts}» does not start with a count of ${LAPS} to 12 (the prompts light up in ${LAPS} turns of the loop)`);
  return { skills, hooks, agents, workflows, prompts, n };
}

/** The loop turns this many times, and the prompts are lit in that many groups. */
export const LAPS = 3;

/** Where the track stands, in % of the drawing's box: its top-left corner and its size. The stylesheet reads them as custom properties (V3Loop.astro), the effect from here. */
export const GEO = { x: 9, y: 27, w: 82, h: 44 } as const;

/** Seconds. The loop plays once, when it comes into view; every picture of it is a pure function of the second it is at (the harness seeks it). */
export const T = {
  intro: 0.45,                                                       // the terms come in, the first corner appears
  t0: 0.5,                                                           // the token leaves the first corner
  leg: 0.375,                                                        // time from one corner's beat to the next (so a lap is four legs, 1.5 s)
  dwell: [0.1, 0.22, 0.1, 0.04] as const,                            // how long the token stands at corner 0..3 before it goes on (corner 1, where the work is done, is the longest)
  flash: 0.5,                                                        // how long a term lights when it fires: 0.08 up, the rest down
  tick: 0.12,                                                        // between one prompt lighting and the next
  trail: 0.07,                                                       // how far behind the token each of the three squares that follow it is (seconds of its path)
  frame0: 0.25,                                                      // the last lap's end -> the frame starts to close round the loop
  frame: 0.7,                                                        // the frame closing
  tail: 0.25,                                                        // everything at rest before the effect lets go
} as const;
export const LAP = T.leg * 4;
export const LAPS_END = T.t0 + LAPS * LAP;                           // the token is back on the first corner for good
export const END = LAPS_END + T.frame0 + T.frame + T.tail;           // 6.2

/** The beat at which corner j (0 plan-ish .. 3) is reached on lap k: the corner's own time on the clock. Lap LAPS, corner 0, is the final return. */
export const beat = (k: number, j: number) => T.t0 + k * LAP + j * T.leg;
/** When prompt tick i lights: in the lap its group belongs to, at the third corner, one after the other. */
export function tickAt(i: number, n: number) {
  const k = Math.min(LAPS - 1, Math.floor((i * LAPS) / n)), first = Math.ceil((k * n) / LAPS);
  return beat(k, 2) + (i - first) * T.tick;
}

/** The nodes the effect writes a style on in a whole pass: the budget of the contract is 80 for a chapter. The browser count (every node whose style changed) must match this table. */
export const NODES = { edges: 4, corners: 4, pings: 4, token: 1, trail: 3, terms: 5, frame: 1 } as const;
export const NODE_BUDGET = 80;
/** The nodes for a drawing of `n` prompt ticks (one node each, the only part whose number comes from the copy). */
export const nodeCount = (n: number) => Object.values(NODES).reduce((a, b) => a + b, 0) + n;
