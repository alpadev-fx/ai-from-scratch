// /v3 boot. Runs only in the browser. The page is complete without any of this: every chapter is real HTML and the hero copy is painted
// from the first frame. This adds Lenis, the WebGL engine and the sequences when motion is allowed and WebGL2 exists, and it never gates
// anything the visitor reads. The ignition is a CSS timeline that the head script in v3.astro ends (no module involved).
//
// The layout is the engine's to switch, it is switched once, and only at the top of the page. Until this module has attached the engine the page
// is the static page plus the hero's engine look in ONE screen (html.fx, v3.css). The tall scroll-driven layout (html.fxl: the hero 5.6 screens,
// chapter 04 6.2) is turned on here, in the same task that builds the engine, and only if the page has not been scrolled at all: everything that
// changes is then below the fold and the hero does not move. A reader who has already scrolled keeps the static layout for the whole visit (console
// warning, html.eng-off): changing the height of the chapters under somebody who is moving through them is a jump, and a pinned stage that
// nothing animates is dead scroll. The head script's 15 s watchdog follows the same rule (it marks eng-off and changes no layout), so nothing
// moves anyone after the first paint; whatever is still loading then stays detached (see `gone`).
import { A } from './state';
import { measure, startScroll, tick } from './core';
import { makeLog, watchHeads } from './hud';
import { mountSpecimens } from './specimens';
import { $ } from './util';

export async function boot() {
  const de = document.documentElement;
  A.copy = JSON.parse(document.getElementById('v3-data')!.textContent || '{}');
  A.lang = de.lang === 'en' ? 'en' : 'es';
  A.rm = de.classList.contains('rm'); A.fx = de.classList.contains('fx');
  A.W = innerWidth; A.H = innerHeight; A.dpr = Math.min(devicePixelRatio || 1, 1.75); A.mobile = A.W <= 1100 || A.W / A.H < 0.8;
  A.paper = () => { const t = de.dataset.theme; return t === 'paper' || (t === 'auto' && matchMedia('(prefers-color-scheme: light)').matches); };
  mountSpecimens(A.copy);
  if (!A.fx) return;                                   // reduced motion / no WebGL2: the static page is the page

  const off = () => de.classList.contains('eng-off');  // this visit has no engine: the watchdog said so, or a decision made here
  const markOff = (reason: string) => { de.dataset.engOff = reason; de.classList.add('eng-off'); de.classList.remove('ign-on'); };
  /** The last word on whether this visit gets the engine: true = leave the page exactly as it is. Asked before every heavy step and once more at the last moment. */
  const gone = () => {
    if (off()) return true;                            // the watchdog gave up on the engine (and said so)
    if (scrollY <= 0) return false;                    // the top of the page: the layout can change below the fold and nothing moves
    console.warn('[v3] the engine does not attach in this visit: the page was scrolled before it was ready, so it keeps its static layout (switching it under a moving reader is a jump)');
    markOff('scrolled'); return true;
  };
  let laid = false;                                    // html.fxl is on and the engine is not live yet
  /** An engine that was built and will not run gives its GPU context back. */
  const release = () => {
    const g = A.gl; A.gl = null; A.log = null; if (!g) return;
    try { g.R.dispose(); g.R.forceContextLoss(); } catch (x) { console.warn('[v3] engine release failed:', x); }
  };
  /** The engine threw after it switched the layout on. All of it ran in one task, so no frame was painted with the tall layout: back to the static one. */
  const giveBack = () => {
    de.classList.remove('fxl', 'ready', 'gl-on', 'foot-on'); de.removeAttribute('data-ch');
    for (const c of A.chapters) if (c.layAdded) c.el.classList.remove('lay');
    A.chapters.length = 0; for (const k of Object.keys(A.byId)) delete A.byId[k];
    A.active = null; A.shot = null; A.after.length = 0;
  };

  // three is loaded after first paint, so the first render never waits on it
  await new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));
  if (gone()) return;                                  // already scrolled: it does not even download three
  try {
    const [THREE, { createEngine }] = await Promise.all([import('three'), import('./engine')]);
    if (gone()) return;
    const cv = document.getElementById('gl') as HTMLCanvasElement;
    const gl = createEngine(THREE, cv);
    if (!gl) throw new Error('no webgl2');
    A.gl = gl;
    A.log = makeLog($('#log')!);
    const [{ initC01 }, { initLLM }] = await Promise.all([import('./c01'), import('./llm')]);
    if (gone()) { release(); return; }                 // the last look. From here to `startScroll()` nothing awaits, so nobody can scroll in between
    laid = true; de.classList.add('fxl');              // the tall layout, now that an engine is about to drive it (register() hands each chapter its `lay`)
    const c1 = initC01(); initLLM(gl);
    de.classList.add('ready', 'gl-on');
    watchHeads(); measure(); A.chapters.forEach(c => c.resize && c.resize());
    c1 && c1.warm && c1.warm();
    tick(performance.now(), true);
    startScroll();
    laid = false;                                      // live
    // 01 keeps its poster until the first two frames of its footage are decoded; then GL draws the plate and CSS fades the poster out.
    // (If those frames never arrive the page simply stays on the poster: nothing the visitor reads depends on them.)
    const seq = c1 && (c1 as any).seq;
    if (seq) await new Promise<void>((done) => {
      const iv = window.setInterval(() => { seq.decode(0); seq.decode(1); if (off() || (seq.has(0) && seq.has(1))) { clearInterval(iv); done(); } }, 60);
    });
    if (off()) return;
    A.foot = true; de.classList.add('foot-on');
  } catch (e) {
    // anything that stops the engine leaves the complete static page, in the layout the reader already has
    console.warn('[v3] engine off:', e);
    if (laid) giveBack();
    release(); markOff('error');
  }
}
