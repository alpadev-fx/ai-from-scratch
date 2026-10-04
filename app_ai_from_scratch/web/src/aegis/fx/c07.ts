// 07 · EL TIEMPO. The twelve lesson titles are piled in twelve rows of their real tokens (the markup is the finished pile) and the course's «40 MIN» is under them. When the pile comes into view the
// chips fall into it from its top edge: the bottom row first, each row on top of the one before, left to right inside a row, each chip in free fall (a row's fall takes the square root of its depth) and
// landing with a small squash and an accent outline that fades, while the number under the pile runs from 0 to 40 in step with the chips that have landed (c07-data.ts has the clocks, the schedule and the
// node budget). That one counter is the only count on the page that runs: the four figures under it (12, 36, 9, 40) are never touched, and no other chapter counts up.
// It plays once, when the pile comes into view, and only if it was fully below the viewport when the engine attached (once()): what a reader meets first is the HTML's own final picture, and one who goes
// past before it played gets that. The number is an overlay on its element: the real text stays in the page, transparent while the overlay runs (v3.css "07"), and is the text the reader ends with; the
// overlay is removed in the very task the last number lands. Nothing here changes layout or writes copy: what moves is transform and opacity, plus --fx-l, how lit a landed chip's outline is, and every picture
// is a pure function of the tween position (the harness seeks it).
import { gsap } from '../hud';
import { NODE_BUDGET, ROWS, T, count, fall, nodeCount, plan } from '../c07-data';
import { $, $$, el } from '../util';
import { effect, onWidth, once, REG } from './common';

const need = (cond: unknown, msg: string) => { if (!cond) throw new Error(`c07: ${msg}`); };

export function initC07() {
  return effect((undo) => {
    const sec = $('#c07'), pile = sec && $<HTMLElement>('[data-pile]', sec), big = pile && $<HTMLElement>('[data-count]', pile);
    const rows = pile ? $$<HTMLElement>('[data-row]', pile) : [], chips = rows.map((r) => $$<HTMLElement>('i', r));
    need(sec && pile && big && rows.length === ROWS && chips.every((c) => c.length >= 1), `the [data-pile] / ${ROWS} [data-row] / [data-count] hooks are missing from the markup (or a row has no chip)`);
    const items = rows.flatMap((_, r) => chips[r]!.map((c) => ({ c, r })));
    need(nodeCount(items.length) <= NODE_BUDGET, `${items.length} chips are more nodes than the ${NODE_BUDGET} of the contract`);

    // the number the counter runs up to: it must be the one printed in the page (the count ends on it, exactly)
    const to = Number(big!.dataset.count);
    need(Number.isFinite(to) && (big!.textContent || '').trim() === String(to), 'the [data-count] is not the number printed in it');
    const P = plan(chips.map((c) => c.length)), when = rows.flatMap((_, r) => chips[r]!.map((_c, k) => P.land[r]![k]!));
    let ov: HTMLElement | undefined, shown = -1, tw: gsap.core.Tween | undefined;
    const show = (k: number) => { if (ov && k !== shown) { shown = k; ov.textContent = String(k); } };

    // how far above its place a chip waits: its row's depth in px, plus a pixel or two (the pile's top edge clips what is above it, so a waiting chip is not seen)
    let D: number[] = [];
    const measure = () => { D = rows.map((r) => r.offsetTop + r.offsetHeight + 2); };
    const last: string[] = [];                                         // what each chip was given last: a chip whose picture did not change is not written to
    const draw = (x: number) => {
      items.forEach(({ c, r }, i) => {
        const L = when[i]!, F = fall(r), u = (x - (L - F)) / F, d = D[r] ?? 0;
        if (u <= 0) { const key = `w${d}`; if (last[i] !== key) { last[i] = key; c.style.opacity = '0'; c.style.transform = `translate3d(0,${(-d).toFixed(1)}px,0)`; c.style.removeProperty('--fx-l'); } return; }
        if (u < 1) {                                                   // in free fall: the distance covered goes with the square of the time
          const y = (-d * (1 - u * u)).toFixed(1), key = `f${y}`;
          if (last[i] !== key) { last[i] = key; c.style.opacity = '1'; c.style.transform = `translate3d(0,${y}px,0)`; }
          return;
        }
        const v = (x - L) / T.squash, f = 1 - (x - L) / T.flash;       // v: 0..1 through the squash, f: how lit the outline still is
        if (v >= 1 && f <= 0) { if (last[i] !== 'd') { last[i] = 'd'; ['opacity', 'transform', '--fx-l'].forEach((p) => c.style.removeProperty(p)); } return; }
        const sy = (v < 1 ? 1 - 0.1 * Math.sin(Math.PI * v) : 1).toFixed(3), lit = Math.max(0, f).toFixed(2), key = `l${sy}|${lit}`;
        if (last[i] !== key) { last[i] = key; c.style.removeProperty('opacity'); c.style.transform = sy === '1.000' ? '' : `scaleY(${sy})`; c.style.setProperty('--fx-l', lit); }
      });
      show(count(P, x, to));
    };
    /** The pile as the page has it: nothing of the effect left on it. */
    const clear = () => {
      tw && tw.kill(); tw = undefined;
      for (const { c } of items) ['opacity', 'transform', '--fx-l'].forEach((p) => c.style.removeProperty(p));
      last.length = 0; ov && ov.remove(); ov = undefined; shown = -1; delete pile!.dataset.fxS; delete REG['c07:stack'];
    };

    undo(onWidth(measure));
    once(pile!, undo, {
      arm: () => {
        pile!.dataset.fxS = 'arm'; measure();
        ov = el('i', 'fxk num'); ov.setAttribute('aria-hidden', 'true'); big!.appendChild(ov); draw(0);
      },
      play: (done) => {
        pile!.dataset.fxS = 'run'; measure();
        const p = { x: 0 };
        tw = gsap.to(p, { x: P.end, duration: P.end, ease: 'none', onUpdate: () => draw(p.x), onComplete: done });
        REG['c07:stack'] = tw;
      },
      clear,
      margin: '0px 0px -18% 0px',                                      // it plays once the pile has come well up the screen: the reader is looking at it
    });
  });
}
