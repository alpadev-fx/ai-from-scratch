// 08 · PRUEBA. The two specimens are real instruments and stay exactly that: nothing here touches what they compute, print or accept. The one thing that moves is the
// bars of the temperature specimen: the first time the card comes into view they grow from their left end to the width the page gave them, one row after the other,
// once. The widths are the page's own (the row's inline width, the same the slider rewrites on every input), so the bars end exactly where the HTML draws them; a bar is
// only ever scaled, from zero up to itself. Moving the slider while they grow ends the effect on the spot: from that input on, the specimen is the plain interactive
// one. Played only if the specimen was fully below the viewport when the engine attached (belowFold): what a reader meets first is the HTML's own final picture.
import { gsap } from '../hud';
import { $, $$, clamp } from '../util';
import { effect, once, REG } from './common';

const STAGGER = 0.09, DUR = 0.9;                                     // seconds between one row and the next, and what one bar takes to grow
const grow = (u: number) => 1 - Math.pow(1 - u, 3);                  // out-cubic: fast off the line, settling on the width

export function initC08() {
  return effect((undo) => {
    const sec = $('#c08'), box = sec && $('[data-bars]', sec), temp = sec && $<HTMLInputElement>('#tempin', sec);
    if (!sec || !box || !temp) throw new Error('c08: the [data-bars] list or the #tempin slider is missing from the markup');
    const bars = () => $$<HTMLElement>('.cb i', box);                // read fresh every time: the slider re-renders the rows with innerHTML
    if (!bars().length) throw new Error('c08: the specimen has no bars');
    let tw: gsap.core.Tween | undefined, total = 0;

    /** The bars at tween position x (seconds into the sweep): a pure function of x, so the harness can seek it. */
    const draw = (x: number) => { bars().forEach((b, k) => { const u = clamp((x - k * STAGGER) / DUR); b.style.transform = u >= 1 ? '' : `scaleX(${grow(u).toFixed(4)})`; }); };
    const clear = () => { tw && tw.kill(); tw = undefined; bars().forEach((b) => b.style.removeProperty('transform')); delete box.dataset.fxS; delete REG['c08:bars']; };

    const st = once(box, undo, {
      arm: () => { total = (bars().length - 1) * STAGGER + DUR; box.dataset.fxS = 'arm'; draw(0); },
      play: (done) => {
        box.dataset.fxS = 'run'; const p = { x: 0 };
        tw = gsap.to(p, { x: total, duration: total, delay: 0.1, ease: 'none', onUpdate: () => draw(p.x), onComplete: done });
        REG['c08:bars'] = tw;
      },
      clear,
    });
    // the specimen answers the reader before anything else: a move of the slider ends the effect (the rows are rewritten by the page's own handler)
    const stop = () => st.clear();
    temp.addEventListener('input', stop); undo(() => temp.removeEventListener('input', stop));
  });
}
