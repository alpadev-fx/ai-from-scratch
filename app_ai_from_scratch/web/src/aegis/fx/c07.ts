// 07 · EL TIEMPO. The ring of twelve ticks draws itself clockwise from twelve o'clock, a bright pen at its head, one tick popping as the pen passes it, while the
// number in its middle runs from 0 to 40 in step with the sweep (the ring is the course: 40 minutes all the way round, a tick for each of its twelve lessons). The
// four figures under it count up the same way when they come in. Each plays once, when it comes into view, and only if it was fully below the viewport when the
// engine attached (belowFold): what a reader meets first is the HTML's own final picture, and one who goes past before it played gets that.
// The ring is revealed by a clip-path wedge on its <svg>. Every number is an overlay on its element: the real text stays in the page, transparent while the overlay
// runs (v3.css "07"), and is the text the reader ends with; the overlay is removed in the very task the last number lands. Nothing here changes layout: only
// transform, opacity and clip-path move, and every picture is a pure function of the tween's position (the harness seeks it).
import { gsap } from '../hud';
import { A } from '../state';
import { $, $$, clamp, el, seg, ss } from '../util';
import { belowFold, effect, onTick, onWidth, passed, REG, whenSeen } from './common';

type Num = { host: HTMLElement; row: HTMLElement; to: number; shown: number; ov?: HTMLElement; tw?: gsap.core.Tween };

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
    const ticks = clock ? $$<SVGElement>('[data-tick]', clock) : [], big = clock && $('[data-count]', clock), specs = sec && $('[data-specs]', sec), dts = specs ? $$('[data-count]', specs) : [];
    if (!sec || !clock || !svg || !stroke || !big || !specs || ticks.length !== 12 || dts.length !== 4) throw new Error('c07: the [data-ring] / [data-ring-stroke] / twelve [data-tick] / [data-count] / [data-specs] hooks are missing from the markup');
    const vb = svg.viewBox.baseVal.width, R = +(stroke.getAttribute('r') || 0), cx = +(stroke.getAttribute('cx') || 0), cy = +(stroke.getAttribute('cy') || 0);
    if (!(vb > 0 && R > 0)) throw new Error('c07: the ring has no radius');

    /** A number the effect counts up to: it must be the one printed in the page (the count ends on it, exactly). */
    const mk = (host: HTMLElement, row: HTMLElement | null): Num => {
      const to = Number(host.dataset.count);
      if (!row || !Number.isFinite(to) || (host.textContent || '').trim() !== String(to)) throw new Error('c07: a [data-count] is not the number printed in it');
      return { host, row, to, shown: -1 };
    };
    const ringNum = mk(big, clock), rows = dts.map((d) => mk(d, d.closest<HTMLElement>('[data-spec]')));
    const show = (n: Num, k: number) => { if (n.ov && k !== n.shown) { n.shown = k; n.ov.textContent = String(k); } };
    const arm = (n: Num) => { const o = el('i', 'fxk num'); o.setAttribute('aria-hidden', 'true'); n.host.appendChild(o); n.ov = o; n.row.dataset.fxS = 'arm'; show(n, 0); };
    const release = (n: Num) => { n.tw && n.tw.kill(); n.tw = undefined; n.ov && n.ov.remove(); n.ov = undefined; n.shown = -1; delete n.row.dataset.fxS; };

    // ---- the ring and its counter
    let ring: 'static' | 'arm' | 'run' = 'static', pen: HTMLElement | undefined, W = 0, stopRing: (() => void) | undefined;
    const XK = ticks.map((_, k) => 1 - Math.sqrt(1 - k / 12));         // the sweep position at which the pen reaches tick k (the inverse of sweep())
    const lastTick: string[] = [];
    const geometry = () => { W = clock.clientWidth; };
    const drawRing = (x: number) => {
      const s = sweep(x), deg = 360 * s, th = (deg * Math.PI) / 180;
      svg.style.clipPath = s >= 1 ? '' : wedge(deg);
      ticks.forEach((t, k) => { const u = clamp((x - XK[k]) / POP), v = (u <= 0 ? 0 : back(u)).toFixed(3); if (v !== lastTick[k]) { lastTick[k] = v; t.style.transform = `scale(${v})`; } });
      if (pen) {
        pen.style.opacity = (ss(seg(x, 0, 0.03)) * (1 - ss(seg(x, 1, X)))).toFixed(3);
        pen.style.transform = `translate3d(${(((cx + R * Math.sin(th)) / vb) * W).toFixed(2)}px,${(((cy - R * Math.cos(th)) / vb) * W).toFixed(2)}px,0)`;
      }
      show(ringNum, Math.round(ringNum.to * s));
    };
    /** The ring as the page has it: nothing of the effect left on it. */
    const clearRing = () => {
      stopRing && stopRing(); stopRing = undefined; ring = 'static';
      svg.style.removeProperty('clip-path'); ticks.forEach((t) => t.style.removeProperty('transform')); lastTick.length = 0;
      pen && pen.remove(); pen = undefined; release(ringNum); delete REG['c07:ring'];
    };
    const playRing = () => {
      stopRing = undefined; ring = 'run'; clock.dataset.fxS = 'run'; geometry();
      const p = { x: 0 };
      ringNum.tw = gsap.to(p, { x: X, duration: X * D, delay: 0.12, ease: 'none', onUpdate: () => drawRing(p.x), onComplete: clearRing });
      REG['c07:ring'] = ringNum.tw;
    };
    if (belowFold(clock)) {
      ring = 'arm'; arm(ringNum); geometry();
      pen = el('div', 'fxk pen'); pen.setAttribute('aria-hidden', 'true'); clock.appendChild(pen);
      drawRing(0);
      stopRing = whenSeen(clock, playRing, '0px 0px -18% 0px');
    }

    // ---- the four figures
    let figs: 'static' | 'arm' | 'run' = 'static', stopFigs: (() => void) | undefined;
    const clearFigs = () => { stopFigs && stopFigs(); stopFigs = undefined; figs = 'static'; rows.forEach((n) => { release(n); delete REG['c07:n' + rows.indexOf(n)]; }); };
    const playFigs = () => {
      stopFigs = undefined; figs = 'run';
      rows.forEach((n, i) => {
        n.row.dataset.fxS = 'run'; const p = { y: 0 };
        n.tw = gsap.to(p, { y: 1, duration: 1.4, delay: 0.05 + i * 0.12, ease: 'none', onUpdate: () => show(n, Math.round(n.to * (1 - Math.pow(1 - p.y, 3)))), onComplete: () => release(n) });
        REG['c07:n' + i] = n.tw;
      });
    };
    if (belowFold(specs)) { figs = 'arm'; rows.forEach(arm); stopFigs = whenSeen(specs, playFigs, '0px 0px -10% 0px'); }

    // a reader who went past before either played gets the page as it is: never a number still waiting at 0 behind them
    let y0 = -1;
    undo(onTick(() => {
      if (A.st.y === y0) return; y0 = A.st.y;
      if (ring === 'arm' && passed(clock)) clearRing();
      if (figs === 'arm' && passed(specs)) clearFigs();
    }));
    undo(onWidth(geometry));
    undo(() => { clearRing(); clearFigs(); delete REG['c07:ring']; });
  });
}
