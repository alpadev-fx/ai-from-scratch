// 05 · CIFRAS. The six figures become a horizontal track the page scrolls along. While the engine drives the page the section is tall and its stage pins
// (html.fxl + the `pin` class this effect adds, both decided at attach, with the reader at the top: v3.css "05"); the vertical scroll then slides the track
// sideways, and each figure drifts against its own card, so the number and the plate it sits on never move together. All of it is a function of the scroll
// position (scrubbed): the reader sets the pace, scrolling back puts everything back, nothing is ever hidden, and no figure leaves its card's padding, so the six
// figures and what they measure are readable at every position. Only transform moves; the track's length is CSS, the numbers below are measured from it.
import { A } from '../state';
import { $, $$, clamp, el } from '../util';
import { effect, onResize, onTick, setPin } from './common';

export function initC05() {
  return effect((undo) => {
    const sec = $('#c05'), stage = sec && $('.pstage', sec), track = stage && $('[data-track]', stage);
    const figs = track ? $$('[data-fig]', track) : [], bigs = figs.map((f) => $('[data-cifra]', f));
    if (!sec || !stage || !track || figs.length !== 6 || bigs.some((b) => !b)) throw new Error('c05: the .pstage / [data-track] / six [data-fig] [data-cifra] hooks are missing from the markup');
    undo(() => sec.classList.remove('pin'));
    const rail = el('div', 'fxk rail'), bar = el('i'); rail.setAttribute('aria-hidden', 'true'); rail.append(bar); stage.appendChild(rail); undo(() => rail.remove());
    undo(() => { track.style.removeProperty('transform'); bigs.forEach((b) => b!.style.removeProperty('transform')); });

    let on = false, top = 0, span = 1, travel = 0, vw = 0, cw = 0, last = -1;
    const mid: number[] = [], amp: number[] = [], rest: number[] = [];
    const M = 12;                                                    // a figure stays at least this far inside its card's edge
    /** Where everything is, from the layout as it is now (nothing transformed): the page position of the stage, how far the track travels, each card's centre on the track,
     *  and how far its figure can move each way inside the card. The figure drifts around the middle of that room, by at most a fifth of the card. */
    const geo = () => {
      track.style.removeProperty('transform'); bigs.forEach((b) => b!.style.removeProperty('transform'));
      const was = on; on = setPin(sec, stage);                       // a viewport too short for the stage (a phone on its side) leaves the static grid
      if (!on) { if (was) console.warn(`[v3] #c05: the stage no longer fits a ${innerWidth}x${innerHeight} viewport; the chapter is the static one`); return; }
      top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - stage.offsetHeight);
      vw = stage.clientWidth;
      const lf = figs[figs.length - 1]; travel = Math.max(0, lf.offsetLeft + lf.offsetWidth + (parseFloat(getComputedStyle(track).paddingRight) || 0) - vw);
      figs.forEach((f, i) => {
        const c = f.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(bigs[i]!); const t = r.getBoundingClientRect();
        cw = f.offsetWidth; mid[i] = f.offsetLeft + cw / 2;
        const lo = -(t.left - c.left - M), hi = c.right - t.right - M;
        if (hi <= lo) { amp[i] = 0; rest[i] = 0; return; }
        amp[i] = clamp((hi - lo) / 2, 0, cw * 0.2); rest[i] = clamp((lo + hi) / 2, lo + amp[i], hi - amp[i]);
      });
      last = -1; frame();
    };
    const frame = () => {
      if (!on) return;
      const p = clamp((A.st.y - top) / span); if (p === last) return; last = p;
      const tx = p * travel;
      track.style.transform = `translate3d(${(-tx).toFixed(2)}px,0,0)`;
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      for (let i = 0; i < figs.length; i++) {
        const s = clamp((mid[i] - tx - vw / 2) / (vw / 2 + cw / 2), -1, 1);       // -1 at the left edge of the screen, 0 centred, 1 at the right edge
        bigs[i]!.style.transform = `translate3d(${(rest[i] + amp[i] * s).toFixed(2)}px,0,0)`;
      }
    };
    geo(); if (!on) throw new Error(`c05: the pinned stage does not fit a ${innerWidth}x${innerHeight} viewport; the chapter stays static`);
    undo(onResize(geo)); undo(onTick(frame));
  });
}
