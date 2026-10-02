// /v3 boot. Runs only in the browser. The page is complete without any of this: every chapter is real HTML and the hero copy is painted
// from the first frame. This adds Lenis, the WebGL engine and the sequences when motion is allowed and WebGL2 exists, and it never gates
// anything the visitor reads. The ignition is a CSS timeline that the head script in v3.astro ends (no module involved), and that script's
// watchdog turns the engine off (class `fx` removed, `nogl` added) if an import hangs instead of throwing: whatever is still loading then
// stays detached (see `off`).
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
  try { history.scrollRestoration = 'manual'; } catch { /* */ }
  scrollTo(0, 0);
  const off = () => !de.classList.contains('fx');      // the head script's watchdog (or the catch below) made this the static page
  // three is loaded after first paint, so the first render never waits on it
  await new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    const [THREE, { createEngine }] = await Promise.all([import('three'), import('./engine')]);
    if (off()) return;
    const cv = document.getElementById('gl') as HTMLCanvasElement;
    const gl = createEngine(THREE, cv);
    if (!gl) throw new Error('no webgl2');
    A.gl = gl;
    A.log = makeLog($('#log')!);
    const [{ initC01 }, { initLLM }] = await Promise.all([import('./c01'), import('./llm')]);
    if (off()) return;
    const c1 = initC01(); initLLM(gl);
    de.classList.add('ready', 'gl-on');
    watchHeads(); measure(); A.chapters.forEach(c => c.resize && c.resize());
    startScroll();
    c1 && c1.warm && c1.warm();
    tick(performance.now(), true);
    // 01 keeps its poster until the first two frames of its footage are decoded; then GL draws the plate and CSS fades the poster out.
    // (If those frames never arrive the page simply stays on the poster: nothing the visitor reads depends on them.)
    const seq = c1 && (c1 as any).seq;
    if (seq) await new Promise<void>((done) => {
      const iv = window.setInterval(() => { seq.decode(0); seq.decode(1); if (off() || (seq.has(0) && seq.has(1))) { clearInterval(iv); done(); } }, 60);
    });
    if (off()) return;
    A.foot = true; de.classList.add('foot-on');
  } catch (e) {
    // anything that stops the engine falls back to the complete static page
    console.warn('[v3] engine off:', e);
    de.classList.remove('fx', 'gl-on', 'foot-on', 'ign-on'); de.classList.add('nogl');
  }
}
