// 03 · QUÉ CAMBIA. The panel above the three benefits draws the process the chapter is about, once, when it comes into view: the request of chapter 02's third case arrives as the real
// o200k tokens it is (the chips are in the HTML, this only brings them in one after the other), and the distribution over the next word, flat at first (every word about as likely), sharpens
// toward one winner as the three things that request lacked (what, for whom, how) land as accent chips next to it. The bars are a drawing (the panel says ILUSTRATIVO); nothing here counts or
// measures anything.
// Nothing is written but transform and opacity (and the custom property --fx-s, the winner's accent, an overlay whose opacity it drives). The panel in the HTML is the final picture: the chips
// in place, the bars at their final heights (the page's CSS scales each from its own height, `--v`), so the drawing ends exactly where the page already is and dispose() gives it back as it was.
// Armed (everything waiting) only if the panel is fully below the viewport when the engine attaches; played once; one the reader passes first is the static panel again.
import { gsap } from '../hud';
import { $, $$, clamp } from '../util';
import { effect, once, REG } from './common';

// seconds into the sequence
const CHIP_STEP = 0.05, CHIP_DUR = 0.3;                 // the request's tokens, one after the other
const RISE_AT = 0.1, RISE_DUR = 0.35, BAR_STEP = 0.015; // the flat distribution rises, bar after bar: all of it is there (flat) before the first slot lands
const SLOT_AT = [0.8, 1.3, 1.8], SLOT_DUR = 0.36;       // what, for whom, how: one every half second
const SHARP_LAG = 0.1, SHARP_DUR = 0.45;                // each slot sharpens the distribution one more step once it has landed
const STEPS = [0.3, 0.65, 1];                           // how far toward the sharp picture after the first, the second and the third slot
const END = SLOT_AT[2] + SHARP_LAG + SHARP_DUR;         // 2.35 s

const out = (u: number) => 1 - Math.pow(1 - u, 3);      // out-cubic: quick off the mark, settling on the final value

type Bar = { el: HTMLElement; v: number; f: number };

export function initC03() {
  return effect((undo) => {
    const sec = $('#c03'), panel = sec && $<HTMLElement>('[data-sharp]', sec), row = panel && $('[data-prompt]', panel);
    const chips = row ? $$<HTMLElement>('.sk', row) : [], slots = panel ? $$<HTMLElement>('[data-slot]', panel) : [];
    if (!sec || !panel || !row || !chips.length) throw new Error('c03: the [data-sharp] panel or its [data-prompt] row of tokens is missing from the markup');
    if (slots.length !== SLOT_AT.length) throw new Error(`c03: ${slots.length} [data-slot] chips, the effect lands ${SLOT_AT.length}`);
    // the winner and the flat picture come from the markup: data-bar is a bar's final height and data-flat its height when every word is about as likely (both as a share of the winner's)
    const bars: Bar[] = $$<HTMLElement>('[data-bar]', panel).map((el) => ({ el, v: parseFloat(el.dataset.bar || ''), f: parseFloat(el.dataset.flat || '') }));
    if (bars.length < 4 || bars.some((b) => !(b.v > 0 && b.v <= 1) || !(b.f > 0 && b.f <= 1))) throw new Error('c03: the bars lack a [data-bar] (final) and a [data-flat] (flat) height between 0 and 1');

    /** How far the distribution has sharpened at x seconds: 0 flat, 1 the final picture. Each slot adds its step once it has landed. */
    const sharp = (x: number) => STEPS.reduce((s, to, k) => s + (to - (k ? STEPS[k - 1] : 0)) * out(clamp((x - SLOT_AT[k] - SHARP_LAG) / SHARP_DUR)), 0);

    /** The whole panel at x seconds: a pure function of x (the harness seeks it). At x >= END every inline style is gone and the page's own CSS draws the final picture. */
    const draw = (x: number) => {
      chips.forEach((c, k) => {
        const u = out(clamp((x - k * CHIP_STEP) / CHIP_DUR));
        c.style.opacity = u >= 1 ? '' : u.toFixed(3);
        c.style.transform = u >= 1 ? '' : `translate3d(0,${((1 - u) * 9).toFixed(2)}px,0)`;
      });
      slots.forEach((c, k) => {
        const u = out(clamp((x - SLOT_AT[k]) / SLOT_DUR));
        c.style.opacity = u >= 1 ? '' : u.toFixed(3);
        c.style.transform = u >= 1 ? '' : `translate3d(0,${(-(1 - u) * 12).toFixed(2)}px,0)`;           // dropped in from above: a sideways offset would be scrollable overflow in a row that is full
      });
      const s = sharp(x);
      bars.forEach((b, k) => {
        const rise = out(clamp((x - RISE_AT - k * BAR_STEP) / RISE_DUR)), h = rise * (b.f + (b.v - b.f) * s);
        b.el.style.transform = rise >= 1 && s >= 1 ? '' : `scaleY(${h.toFixed(4)})`;
      });
      panel.style.setProperty('--fx-s', s >= 1 ? '1' : s.toFixed(4));
    };

    let tw: gsap.core.Tween | undefined;
    /** The static panel back, exactly: no inline style, no state, no custom property. Safe to call at any time. */
    const clear = () => {
      tw && tw.kill(); tw = undefined;
      for (const e of [...chips, ...slots, ...bars.map((b) => b.el)]) { e.style.removeProperty('opacity'); e.style.removeProperty('transform'); }
      panel.style.removeProperty('--fx-s'); delete panel.dataset.fxS; delete REG['c03:sharp'];
    };

    once(panel, undo, {
      arm: () => { panel.dataset.fxS = 'arm'; draw(0); },
      play: (done) => {
        panel.dataset.fxS = 'run'; const p = { x: 0 };
        tw = gsap.to(p, { x: END, duration: END, ease: 'none', onUpdate: () => draw(p.x), onComplete: done });
        REG['c03:sharp'] = tw;
      },
      clear,
      margin: '0px 0px -12% 0px',
    });
  });
}
