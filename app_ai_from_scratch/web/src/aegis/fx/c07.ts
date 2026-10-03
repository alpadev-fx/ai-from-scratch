// 07 · EL TIEMPO. The ring of twelve ticks draws itself clockwise from twelve o'clock, a bright pen at its head, one tick popping as the pen passes it, while the
// number in its middle runs from 0 to 40 in step with the sweep (the ring is the course: 40 minutes all the way round, a tick for each of its twelve lessons). That one
// counter is the only count on the page that runs: the four figures under it (12, 36, 9, 40) are never touched, and no other chapter counts up.
// It plays once, when the clock comes into view, and only if the clock was fully below the viewport when the engine attached (belowFold): what a reader meets first is the
// HTML's own final picture, and one who goes past before it played gets that.
// The ring is revealed by a clip-path wedge on its <svg>. The number is an overlay on its element: the real text stays in the page, transparent while the overlay
// runs (v3.css "07"), and is the text the reader ends with; the overlay is removed in the very task the last number lands. Nothing here changes layout: only
// transform, opacity and clip-path move, and every picture is a pure function of the tween position (the harness seeks it).
import { gsap } from '../hud';
import { A } from '../state';
import { $, $$, clamp, el, seg, ss } from '../util';
import { belowFold, effect, onTick, onWidth, passed, REG, whenSeen } from './common';

const D = 2.4;                                     // seconds the sweep takes (ease-out: it settles on 40)
const X = 1.1;                                     // the tween runs to 1.1: 0..1 is the sweep, the rest lets the last tick finish popping and the pen fade
const POP = 0.2;                                   // how long a tick takes to pop, in sweep units
const sweep = (x: number) => 1 - Math.pow(1 - clamp(x), 2);          // 0..1: how much of the ring (and of the count) is done at tween position x
const back = (u: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };   // a pop that overshoots, then settles on 1

/** A pie slice from twelve o'clock, clockwise, `deg` wide, as a clip-path on the (square) <svg>. The two rays are exact; the arc is drawn outside the box (90 % radius, a vertex
 *  every 30 degrees: a chord never comes inside the corners, which are 71 % away). */
const wedge = (deg: number) => {
  const n = Math.max(1, Math.ceil(deg / 30)), pts = ['50% 50%'];
  for (let k = 0; k <= n; k++) { const a = ((-90 + (deg * k) / n) * Math.PI) / 180; pts.push(`${(50 + 90 * Math.cos(a)).toFixed(2)}% ${(50 + 90 * Math.sin(a)).toFixed(2)}%`); }
  return `polygon(${pts.join(',')})`;
};

export function initC07() {
  return effect((undo) => {
    const sec = $('#c07'), clock = sec && $('[data-ring]', sec), svg = clock && $<SVGSVGElement>('svg', clock), stroke = clock && $<SVGElement>('[data-ring-stroke]', clock);
    const ticks = clock ? $$<SVGElement>('[data-tick]', clock) : [], big = clock && $('[data-count]', clock);
    if (!sec || !clock || !svg || !stroke || !big || ticks.length !== 12) throw new Error('c07: the [data-ring] / [data-ring-stroke] / twelve [data-tick] / [data-count] hooks are missing from the markup');
    const vb = svg.viewBox.baseVal.width, R = +(stroke.getAttribute('r') || 0), cx = +(stroke.getAttribute('cx') || 0), cy = +(stroke.getAttribute('cy') || 0);
    if (!(vb > 0 && R > 0)) throw new Error('c07: the ring has no radius');

    // the number the counter runs up to: it must be the one printed in the page (the count ends on it, exactly)
    const to = Number(big.dataset.count);
    if (!Number.isFinite(to) || (big.textContent || '').trim() !== String(to)) throw new Error('c07: the [data-count] is not the number printed in it');
    let ov: HTMLElement | undefined, shown = -1, tw: gsap.core.Tween | undefined;
    const show = (k: number) => { if (ov && k !== shown) { shown = k; ov.textContent = String(k); } };

    let state: 'static' | 'arm' | 'run' = 'static', pen: HTMLElement | undefined, W = 0, stop: (() => void) | undefined;
    const XK = ticks.map((_, k) => 1 - Math.sqrt(1 - k / 12));         // the sweep position at which the pen reaches tick k (the inverse of sweep())
    const lastTick: string[] = [];
    const geometry = () => { W = clock.clientWidth; };
    const draw = (x: number) => {
      const s = sweep(x), deg = 360 * s, th = (deg * Math.PI) / 180;
      svg.style.clipPath = s >= 1 ? '' : wedge(deg);
      ticks.forEach((t, k) => { const u = clamp((x - XK[k]) / POP), v = (u <= 0 ? 0 : back(u)).toFixed(3); if (v !== lastTick[k]) { lastTick[k] = v; t.style.transform = `scale(${v})`; } });
      if (pen) {
        pen.style.opacity = (ss(seg(x, 0, 0.03)) * (1 - ss(seg(x, 1, X)))).toFixed(3);
        pen.style.transform = `translate3d(${(((cx + R * Math.sin(th)) / vb) * W).toFixed(2)}px,${(((cy - R * Math.cos(th)) / vb) * W).toFixed(2)}px,0)`;
      }
      show(Math.round(to * s));
    };
    /** The clock as the page has it: nothing of the effect left on it. */
    const clear = () => {
      stop && stop(); stop = undefined; state = 'static';
      svg.style.removeProperty('clip-path'); ticks.forEach((t) => t.style.removeProperty('transform')); lastTick.length = 0;
      pen && pen.remove(); pen = undefined; tw && tw.kill(); tw = undefined; ov && ov.remove(); ov = undefined; shown = -1; delete clock.dataset.fxS; delete REG['c07:ring'];
    };
    const play = () => {
      stop = undefined; state = 'run'; clock.dataset.fxS = 'run'; geometry();
      const p = { x: 0 };
      tw = gsap.to(p, { x: X, duration: X * D, delay: 0.12, ease: 'none', onUpdate: () => draw(p.x), onComplete: clear });
      REG['c07:ring'] = tw;
    };
    if (belowFold(clock)) {
      state = 'arm'; geometry();
      ov = el('i', 'fxk num'); ov.setAttribute('aria-hidden', 'true'); big.appendChild(ov); clock.dataset.fxS = 'arm';
      pen = el('div', 'fxk pen'); pen.setAttribute('aria-hidden', 'true'); clock.appendChild(pen);
      draw(0);
      stop = whenSeen(clock, play, '0px 0px -18% 0px');
    }

    // a reader who went past before it played gets the page as it is: never a number still waiting at 0 behind them
    let y0 = -1;
    undo(onTick(() => { if (A.st.y === y0) return; y0 = A.st.y; if (state === 'arm' && passed(clock)) clear(); }));
    undo(onWidth(geometry));
    undo(clear);
  });
}
