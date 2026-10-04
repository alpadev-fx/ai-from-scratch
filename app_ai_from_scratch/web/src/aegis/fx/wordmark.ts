// 17 · WORDMARK. «AI FROM SCRATCH», the ghost outline that ends the page (v3.astro, the paths in src/aegis/wordmark.ts), is the footer mark of the AEGIS landing ported to this page: when it
// comes into view the outline draws itself, and from then on, for as long as it is on screen, short white lines run along the edges of its letters. The page's own picture is the outline
// fully drawn on the black footer plate; this only draws it once and lights it. It writes no copy (there is none: the mark is aria-hidden paths).
//
// The runners are an extra svg laid over each outline (`.wrs`, added here, aria-hidden like the rest) with one path per contour of the letters, a copy of that contour: its stroke is dashed
// (one short dash, a gap up to the pattern's period) and the dash offset is animated by CSS (v3.css `fx-wm-lap`, linear, infinite), so the dash laps its contour. Each contour has its own
// phase (wordmark-phase.ts), so lines are always running somewhere on the mark: the AEGIS footer starts every contour together and leaves the mark empty for part of each lap. The glow
// is a drop-shadow on that one overlay svg (WebKit does not paint a CSS filter on a path inside an svg). The stroke is non-scaling (it keeps its pixel width at every size), and so are
// the dashes (screen pixels), so the effect sizes them from the real size of each mark: the same picture, scaled, at every width.
//
// It plays once (the draw), only if the mark was fully below the viewport when the engine attached (the shared play-once shape in common.ts asks it): what a reader meets first is the
// HTML's own final picture. The runners start when the draw is done and stop whenever the mark is off screen (an IntersectionObserver), so nothing animates that nobody sees. Only
// transform, and the --fx-* custom properties the stage-2B rules read, change here; dispose() removes the overlays and everything else and gives back the page's outline, exactly.
import { gsap } from '../hud';
import { $, $$, eio, eo } from '../util';
import { effect, once, onWidth, REG } from './common';
import { KU, LAP, lap } from './wordmark-phase';

const NS = 'http://www.w3.org/2000/svg';
const DASH = 0.082;      // the runner's length, in longest contours (62 px on a 1440 screen)
const DRAW = 2.2;        // seconds the outline takes to draw itself (eased in and out)
const FIT = 1.04;        // the draw's dash is this many longest contours: the longest contour is complete exactly when the draw is
const RISE = 0.34;       // the mark rises this share of its own height while it draws, out of the bottom edge it is cropped by

interface Mark { wrap: HTMLElement; svg: SVGSVGElement; ov: SVGSVGElement; vbw: number; vbh: number; lm: number; px: number; h: number }

export function initWordmark() {
  return effect((undo) => {
    const box = $('[data-fx="wordmark"]'), wraps = box ? $$('.wmr', box) : [];
    if (!box || wraps.length !== 2) throw new Error('wordmark: the [data-fx="wordmark"] block and its two .wmr layouts are missing from the markup');

    // one overlay per layout: a copy of each contour of the outline, with the phase the lap gives it
    const marks: Mark[] = wraps.map((wrap) => {
      const svg = $<SVGSVGElement>('svg', wrap), o = svg && $<SVGPathElement>('path.o', svg);
      const lc = ((svg && svg.dataset.lc) || '').split(',').map(Number), parts = ((o && o.getAttribute('d')) || '').split(/(?=M)/);
      if (!svg || !o || lc.length < 2 || lc.length !== parts.length || lc.some((c) => !(c > 0)) || !(svg.viewBox.baseVal.width > 0))
        throw new Error('wordmark: each layout needs an svg with a viewBox, a path.o with one M per contour and a data-lc with that many lengths');
      const ov = document.createElementNS(NS, 'svg'), l = lap(lc);
      ov.setAttribute('class', 'fxk wrs'); ov.setAttribute('viewBox', svg.getAttribute('viewBox') || ''); ov.setAttribute('aria-hidden', 'true'); ov.setAttribute('focusable', 'false');
      parts.forEach((d, i) => {
        const r = document.createElementNS(NS, 'path');
        r.setAttribute('class', 'wr'); r.setAttribute('d', d); r.style.setProperty('--fx-ph', `${(l.starts[i] - LAP).toFixed(3)}s`);   // a negative delay: the runner is already mid-lap when it starts
        ov.appendChild(r);
      });
      wrap.appendChild(ov);
      return { wrap, svg, ov, vbw: svg.viewBox.baseVal.width, vbh: svg.viewBox.baseVal.height, lm: Math.max(...lc), px: 0, h: 0 };
    });
    box.style.setProperty('--fx-T', `${LAP}s`);

    let x = 0, drawn = false, inView = false, live = true, tw: gsap.core.Tween | undefined;
    /** The outline at draw position p (0..1): how much of each contour is still to draw, and how far the mark still has to rise. A pure function of p, so the harness can seek it. */
    const draw = (p: number) => {
      x = p;
      for (const m of marks) {
        m.svg.style.setProperty('--fx-o', (FIT * m.px * (1 - eio(p))).toFixed(1));
        m.wrap.style.transform = p >= 1 ? '' : `translate3d(0,${((1 - eo(p)) * RISE * m.h).toFixed(1)}px,0)`;
      }
    };
    /** The sizes in screen pixels (both layouts, whichever is on screen): the longest contour, the dash, the gap, the pattern. Every layout is as wide as the box's content. */
    const fit = () => {
      const cs = getComputedStyle(box), inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (!(inner > 0)) return;
      for (const m of marks) {
        const k = inner / m.vbw; m.px = m.lm * k; m.h = m.vbh * k;
        m.ov.style.setProperty('--fx-d', (DASH * m.px).toFixed(1)); m.ov.style.setProperty('--fx-g', ((KU - DASH) * m.px).toFixed(1)); m.ov.style.setProperty('--fx-P', (KU * m.px).toFixed(1));
        m.svg.style.setProperty('--fx-dw', (FIT * m.px).toFixed(1));
      }
      if (box.dataset.fxS) draw(x);                                       // the draw's own numbers depend on the size
    };
    /** Runners run while the mark is drawn and on screen, and only then. */
    const sync = () => { if (live) box.classList.toggle('run', drawn && inView); };
    const io = new IntersectionObserver((es) => { for (const e of es) inView = e.isIntersecting; sync(); });

    /** The mark as the page has it: nothing of the draw left on it. */
    const clear = () => {
      tw && tw.kill(); tw = undefined; x = 0;
      for (const m of marks) { m.wrap.style.removeProperty('transform'); m.svg.style.removeProperty('--fx-o'); if (!m.wrap.getAttribute('style')) m.wrap.removeAttribute('style'); }
      delete box.dataset.fxS; delete REG['wm:draw'];
      drawn = true; sync();
    };
    fit();
    // the band is the last thing on the page: it is 'seen' when 40 px of it are, which is all it has at the very end of the scroll (the default margin would never see it)
    const st = once(box, undo, {
      margin: '0px 0px -40px 0px',
      arm: () => { box.dataset.fxS = 'arm'; fit(); draw(0); },
      play: (done) => {
        box.dataset.fxS = 'run'; fit();
        const p = { x: 0 };
        tw = gsap.to(p, { x: 1, duration: DRAW, delay: 0.1, ease: 'none', onUpdate: () => draw(p.x), onComplete: done });
        REG['wm:draw'] = tw;
      },
      clear,
    });
    drawn = st.state() !== 'arm';                                         // a mark already in view when the engine attached is the page's own final picture: it only lights up
    io.observe(box);
    undo(onWidth(fit));
    undo(() => {
      live = false; io.disconnect(); box.classList.remove('run'); box.style.removeProperty('--fx-T');
      for (const m of marks) { m.ov.remove(); m.svg.style.removeProperty('--fx-dw'); m.svg.style.removeProperty('--fx-o'); if (!m.svg.getAttribute('style')) m.svg.removeAttribute('style'); }
      if (!box.getAttribute('style')) box.removeAttribute('style');
    });
  });
}
