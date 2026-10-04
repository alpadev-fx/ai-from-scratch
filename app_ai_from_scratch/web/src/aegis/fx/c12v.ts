// 12 · QUIÉN, the harness as a loop. Under the heading sits a drawing of what the instructor's closing sentence lists (src/components/V3Loop.astro): a token goes round a square track and stops at
// its four corners (three squares follow it); the SKILLS are loaded at the first, the HOOKS fire at the second (before and after the work), the prompts light up three by three at the third,
// and AGENTES beats each time the token comes home; the first lap draws the track; after the last lap a frame closes round the loop and says WORKFLOWS. It plays ONCE, for about six seconds, when it comes into view. The markup is the finished picture (the loop at rest):
// the effect only plays it, and dispose() gives it back exactly. Nothing here writes copy and nothing counts or measures: the drawing says ILUSTRATIVO, and its words are the sentence's own.
// What it writes is transform, opacity and clip-path, plus --fx-l, how lit a term is (an overlay turns it into the opacity of an accent outline). The picture is a pure function of the second it
// is at (draw(x): the harness seeks it). Armed (everything waiting at its start) only if the drawing is fully below the viewport when the engine attaches (once()); one the reader passes before it
// played is the finished picture again. Budget: the chapter writes a style on nodeCount(n) nodes in a whole pass (c12-data's NODES + one per prompt tick), under the 80 of the contract.
import { gsap } from '../hud';
import { END, GEO, LAP, LAPS, LAPS_END, NODES, T, beat, tickAt } from '../c12-data';
import { $, $$, clamp } from '../util';
import { effect, onWidth, once, REG } from './common';

const out = (u: number) => 1 - Math.pow(1 - u, 3);                  // out-cubic
const io = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);   // in-out cubic
const seg = (x: number, a: number, d: number) => clamp((x - a) / d); // how far through [a, a+d] x is, 0..1
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wipe = (es: Array<Element | null | undefined>, ...props: string[]) => { for (const e of es) if (e) for (const p of props) (e as HTMLElement).style.removeProperty(p); };
const need = (cond: unknown, msg: string) => { if (!cond) throw new Error(`c12: ${msg}`); };

/** 0 -> 1 -> 0: a term lighting up when it fires at `at`: up in 0.08 s, down over the rest of T.flash. */
const bump = (x: number, at: number) => { const s = x - at; return s <= 0 ? 0 : s < 0.08 ? s / 0.08 : Math.max(0, 1 - (s - 0.08) / (T.flash - 0.08)); };
const PING = 0.45;                                                   // how long a corner's square outline takes to go out and fade

/** The corners' beats of the whole pass, per corner: the times the token reaches it (corner 0 is also the final return). */
const beats = (j: number) => Array.from({ length: j === 0 ? LAPS + 1 : LAPS }, (_, k) => beat(k, j));

export function initC12V() {
  return effect((undo) => {
    const sec = $('#c12'), box = sec && $<HTMLElement>('[data-loop]', sec), fig = box && $<HTMLElement>('.lp-fig', box);
    need(box && fig, 'the loop drawing is not in chapter 12 (no [data-loop] with its .lp-fig)');
    const q = (s: string) => $<HTMLElement>(s, fig!)!;
    const edges = $$<HTMLElement>('.lp-e', fig!), corners = $$<HTMLElement>('.lp-s', fig!), pings = $$<HTMLElement>('.lp-p', fig!), ticks = $$<HTMLElement>('.lp-t', fig!), trail = $$<HTMLElement>('.lp-g', fig!);
    const tok = q('.lp-k'), frame = q('.lp-wf'), wl = q('.lp-wl'), ag = q('.lp-ag'), sk = q('.lp-sk'), hk = q('.lp-hk'), pl = q('.lp-pl');
    need(edges.length === NODES.edges && corners.length === NODES.corners && pings.length === NODES.pings && trail.length === NODES.trail && tok && frame && wl && ag && sk && hk && pl && ticks.length >= LAPS, 'the loop drawing lacks a part (4 edges, 4 corners, 4 pings, the token and its 3 followers, the frame, 5 terms, the prompt ticks)');
    const n = ticks.length, terms = [wl, ag, sk, hk, pl];
    // when each term fires (skills at the first corner, hooks at the second before and after the work, the prompt label at the third) and when it is done lighting
    const fires = new Map<HTMLElement, number[]>([[ag, beats(0)], [sk, beats(0)], [hk, beats(1).flatMap((b) => [b, b + T.dwell[1] - 0.02])], [pl, beats(2)]]), dims = new Set([sk, hk, pl]);
    const lastFire = (e: HTMLElement) => Math.max(...(fires.get(e) ?? [0]));
    const arrive = new Map<HTMLElement, number>([[ag, 0.1], [sk, 0.2], [hk, 0.28], [pl, 0.36], [wl, LAPS_END + T.frame0 + 0.35]]);
    let W = 0, H = 0;

    /** Where the token is, in px from the first corner, at x (between its first departure and its return): four legs a lap, each with its dwell at the corner it leaves. */
    const at = (x: number): [number, number] => {
      const dx = (GEO.w / 100) * W, dy = (GEO.h / 100) * H, c = [[0, 0], [dx, 0], [dx, dy], [0, dy]] as const;
      const s = clamp(x - T.t0, 0, LAPS * LAP - 1e-6), r = s - Math.floor(s / LAP) * LAP, j = Math.min(3, Math.floor(r / T.leg)), d = T.dwell[j]!, m = io(seg(r - j * T.leg, d, T.leg - d)), a = c[j]!, b = c[(j + 1) % 4]!;
      return [lerp(a[0], b[0], m), lerp(a[1], b[1], m)];
    };
    const draw = (x: number) => {
      // the track: lap 0's token draws each edge as it goes along it
      edges.forEach((e, j) => { const u = io(seg(x, T.t0 + j * T.leg + T.dwell[j]!, T.leg - T.dwell[j]!)); e.style.transform = u >= 1 ? '' : `${j % 2 ? 'scaleY' : 'scaleX'}(${u.toFixed(4)})`; });
      // the corners appear as the loop is first drawn; a square outline goes out from each one every time the token reaches it
      corners.forEach((c, j) => {
        const a = out(seg(x, j === 0 ? 0 : beat(0, j) - 0.04, j === 0 ? T.intro : 0.18));
        c.style.opacity = a >= 1 ? '' : a.toFixed(3); c.style.transform = a >= 1 ? '' : `scale(${(0.4 + 0.6 * a).toFixed(3)})`;
        const g = pings[j]!; let u = -1; for (const te of beats(j)) if (x >= te && x < te + PING) u = (x - te) / PING;
        g.style.opacity = u < 0 ? '' : (0.85 * (1 - u)).toFixed(3); g.style.transform = u < 0 ? '' : `scale(${(1 + 1.5 * out(u)).toFixed(3)})`;
      });
      // the token: still on the first corner until t0, then four legs a lap, three laps, and home; three squares follow it a little behind
      const home = x <= T.t0 || x >= LAPS_END;
      if (home) { tok.style.transform = ''; tok.style.opacity = x <= T.t0 ? seg(x, 0.2, 0.15).toFixed(3) : ''; }
      else { const [X, Y] = at(x); tok.style.opacity = ''; tok.style.transform = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,0)`; }
      trail.forEach((g, i) => {
        const xs = x - T.trail * (i + 1);
        if (xs <= T.t0 + 0.02 || x >= LAPS_END) { g.style.opacity = ''; g.style.transform = ''; return; }
        const [X, Y] = at(xs); g.style.opacity = (0.5 / (i + 1)).toFixed(3); g.style.transform = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,0) scale(${(1 - 0.16 * (i + 1)).toFixed(2)})`;
      });
      // the terms: they come in with the loop, light when they fire, and settle at full strength once the last has fired
      for (const e of terms) {
        const arr = arrive.get(e) ?? 0, a = out(seg(x, arr, 0.3)), ev = fires.get(e) ?? [], b = Math.max(0, ...ev.map((t) => bump(x, t)));
        const idle = dims.has(e) ? lerp(0.62, 1, seg(x, lastFire(e) + 0.3, 0.3)) : 1, last = ev.length ? lastFire(e) + 0.6 : arr + 0.3;
        if (x >= last) { wipe([e], 'opacity', 'transform', '--fx-l'); continue; }
        e.style.opacity = (a * (idle + (1 - idle) * b)).toFixed(3);
        e.style.transform = `translate3d(0,${((1 - a) * -8).toFixed(1)}px,0) scale(${(1 + 0.08 * b).toFixed(3)})`;
        e.style.setProperty('--fx-l', b.toFixed(3));
      }
      // the prompts light up three by three, at the third corner
      ticks.forEach((t, i) => { const a = out(seg(x, tickAt(i, n), 0.25)); t.style.opacity = a >= 1 ? '' : (0.18 + 0.82 * a).toFixed(3); t.style.transform = a >= 1 ? '' : `scale(${(0.5 + 0.5 * a).toFixed(3)})`; });
      // the frame closes round the whole loop
      const f = io(seg(x, LAPS_END + T.frame0, T.frame)); frame.style.clipPath = f >= 1 ? '' : `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0)`;
    };
    const measure = () => { W = fig!.offsetWidth; H = fig!.offsetHeight; };
    const clear = () => { wipe([...edges, ...corners, ...pings, tok, ...trail, frame, ...terms, ...ticks], 'opacity', 'transform', 'clip-path', '--fx-l'); delete box!.dataset.fxS; delete REG['c12:loop']; };

    let tw: gsap.core.Tween | undefined;
    undo(onWidth(measure));
    once(box!, undo, {
      arm: () => { box!.dataset.fxS = 'arm'; measure(); draw(0); },
      play: (done) => {
        box!.dataset.fxS = 'run'; measure(); draw(0);
        const p = { x: 0 };
        tw = gsap.to(p, { x: END, duration: END, ease: 'none', onUpdate: () => draw(p.x), onComplete: done });
        REG['c12:loop'] = tw;
      },
      clear: () => { tw && tw.kill(); tw = undefined; clear(); },
      margin: '0px 0px -22% 0px',                                    // it plays once it has come well up the screen: the reader is looking at it
    });
  });
}
