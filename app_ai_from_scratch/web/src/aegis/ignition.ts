// 00 · IGNICIÓN. dot → line → the "IA" square draws → "IA" fills → glint → the
// camera pushes through the square into 01. The counter is bound to REAL loading
// (the first frames of 01 + fonts), capped at 4.5 s. Once per session; Esc or a
// click skips; never runs under reduced motion (main.ts does not call it).
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { A } from './state';
import type { Seq } from './seq';
import { $ } from './util';

gsap.registerPlugin(DrawSVGPlugin);
const KEY = 'v3_ign';

export const ignitionSeen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

export function runIgnition(first: Seq | null): Promise<void> {
  return new Promise((resolve) => {
    const ign = $('#ign');
    if (!ign) { A.intro = 1; return resolve(); }
    const pt = $('.pt', ign)!, ln = $('.iln', ign)!, sq = $('.isq', ign) as unknown as SVGElement, ia = $('.iia', ign)!, glint = $('.glint', ign)!, lock = $('.lock', ign)!, ilog = $('.ilog', ign)!, pct = $('.pct', ign)!, skip = $('.iskip', ign);
    let done = false, tl: gsap.core.Timeline | null = null, iv = 0;
    const finish = () => {
      if (done) return; done = true; clearInterval(iv); tl && tl.kill();
      try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
      ign.classList.add('gone'); document.documentElement.classList.remove('ign-on');
      A.lenis && A.lenis.start();
      gsap.to(A, { intro: 1, duration: 1.7, ease: 'none' });
      removeEventListener('keydown', onKey); resolve();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    addEventListener('keydown', onKey); ign.addEventListener('click', finish);
    A.lenis && A.lenis.stop();
    const text = ilog.dataset.text || '';
    // the scramble types the line in; on a phone it wraps onto a second line part-way, which shifted the layout (CLS 0.0012). Reserve the final wrap first.
    ilog.textContent = text; const lh = ilog.offsetHeight; ilog.textContent = ''; if (lh > 0) ilog.style.minHeight = lh + 'px';
    gsap.to(ilog, { duration: 1.0, scrambleText: { text, chars: '01·—/<>', speed: 0.7 } });
    gsap.set(pt, { scale: 1 }); gsap.set([ln, sq, ia, glint], { opacity: 0 });
    first && first.warm();
    const t0 = performance.now(), NEED = 12;
    const MAX = 4500;
    let ready = false;
    const fontsP = document.fonts ? document.fonts.ready.then(() => true) : Promise.resolve(true);
    let fontsOk = false; fontsP.then(() => { fontsOk = true; });
    const go = () => {
      if (done) return; ready = true; pct.textContent = '100';
      tl = gsap.timeline({ onComplete: finish });
      tl.to(pt, { scaleX: 60, scaleY: 0.5, duration: 0.45, ease: 'expo.in' })
        .set(ln, { opacity: 1, scaleX: 1 }).set(pt, { opacity: 0 })
        .to(ln, { scaleY: 40, opacity: 0, duration: 0.3, ease: 'power2.in' }, '+=0.12')
        .set(sq, { opacity: 1 }, '<')
        .fromTo(sq, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.9, ease: 'power2.inOut' }, '<')
        .fromTo(ia, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.2')
        .set(glint, { opacity: 1 })
        .fromTo(glint, { backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0', duration: 0.9, ease: 'power2.inOut' }, '-=0.1')
        .to(lock, { scale: 46, duration: 1.1, ease: 'expo.in', transformOrigin: '50% 50%' }, '+=0.2')
        .to([ilog, pct, skip], { opacity: 0, duration: 0.3 }, '<')
        .to($('.ibg', ign)!, { opacity: 0, duration: 0.55, ease: 'power1.in' }, '-=0.5');
    };
    iv = window.setInterval(() => {
      if (done || ready) return;
      const el = performance.now() - t0, k = first ? first.head(NEED) : NEED;
      const frac = Math.min(1, (k / NEED) * 0.85 + (fontsOk ? 0.15 : 0));
      pct.textContent = String(Math.round(100 * Math.min(frac, el / 900))).padStart(3, '0');
      if ((frac >= 1 && el > 1100) || el > MAX) { clearInterval(iv); go(); }
    }, 60);
  });
}
