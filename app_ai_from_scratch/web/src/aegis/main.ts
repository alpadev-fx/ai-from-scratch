// /v3 boot. Runs only in the browser. The page is complete without any of this
// (every chapter is real HTML); this adds Lenis, the WebGL engine, the sequences
// and the ignition when motion is allowed and WebGL2 exists.
import { A } from './state';
import { measure, startScroll, tick, scrollToY } from './core';
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
  // three is loaded after first paint, so the first render never waits on it
  await new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    const [THREE, { createEngine }] = await Promise.all([import('three'), import('./engine')]);
    const cv = document.getElementById('gl') as HTMLCanvasElement;
    const gl = createEngine(THREE, cv);
    if (!gl) throw new Error('no webgl2');
    A.gl = gl;
    A.log = makeLog($('#log')!);
    const [{ initC01 }, { initLLM }, { runIgnition, ignitionSeen }] = await Promise.all([import('./c01'), import('./llm'), import('./ignition')]);
    const c1 = initC01(); initLLM(gl);
    de.classList.add('ready', 'gl-on');
    watchHeads(); measure(); A.chapters.forEach(c => c.resize && c.resize());
    startScroll();
    c1 && c1.warm && c1.warm();
    tick(performance.now(), true);
    if (ignitionSeen()) { de.classList.remove('ign-on'); A.intro = 0; const { gsap } = await import('gsap'); gsap.to(A, { intro: 1, duration: 1.7, ease: 'none', delay: 0.2 }); $('#ign')?.classList.add('gone'); }
    else await runIgnition(c1 ? (c1 as any).seq : null);
    void scrollToY;
  } catch (e) {
    // anything that stops the engine falls back to the complete static page
    console.warn('[v3] engine off:', e);
    de.classList.remove('fx', 'gl-on', 'ign-on'); de.classList.add('nogl');
  }
}
