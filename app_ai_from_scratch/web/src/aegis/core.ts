// Scroll engine. Chapters are sections `len x 100svh` tall holding a sticky
// stage (no ScrollTrigger pin: nothing is re-parented, so hydration and the
// static fallback stay intact). One loop, driven by gsap.ticker, computes each
// chapter's progress and the scroll velocity the post chain uses.
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { A, type Chapter, type Shot } from './state';
import { $, $$, clamp } from './util';

export function register(c: Partial<Chapter> & { id: string }): Chapter | null {
  const el = document.getElementById(c.id); if (!el) return null;
  // `lay` hands the chapter to the engine layout (v3.css): its stage pins and, once the engine has switched html.fxl on, it is `--len` screens tall.
  // The hero has it in its markup (its look is the engine's from the first paint); every other chapter gets it here, so nothing is tall before an engine exists.
  const layAdded = !el.classList.contains('lay'); if (layAdded) el.classList.add('lay');
  const ch = Object.assign(c, { el, stage: ($('.stage', el) || el) as HTMLElement, p: 0, near: false, vis: false, top: 0, h: 0, span: 1, layAdded }) as Chapter;
  A.chapters.push(ch); A.byId[ch.id] = ch; return ch;
}
export function chapterAt(y: number) {
  const c = y + A.H * 0.5;
  for (const ch of A.chapters) if (c >= ch.top && c < ch.top + ch.h) return ch;
  return null;
}
export function measure() {
  A.W = innerWidth; A.H = innerHeight; A.mobile = A.W <= 1100 || A.W / A.H < 0.8;
  const y0 = scrollY;
  for (const ch of A.chapters) { const r = ch.el.getBoundingClientRect(); ch.top = r.top + y0; ch.h = r.height; ch.span = Math.max(1, ch.h - A.H); }
  A.chapters.sort((a, b) => a.top - b.top);
  const tot = document.documentElement.scrollHeight - A.H, pr = $('#prog');
  if (pr) { $$('i', pr).forEach(e => e.remove()); for (const ch of A.chapters) { const i = document.createElement('i'); i.style.left = (100 * ch.top / Math.max(1, tot)) + '%'; pr.appendChild(i); } }
}
const progressOf = (ch: Chapter, y: number) => (A.rm && ch.rmP != null ? ch.rmP : clamp((y - ch.top) / ch.span));

// Between two chapters the leaving and the arriving stage are held in place for
// one screen of scroll (their translation is cancelled), so the engine can
// dissolve between them instead of cutting.
function hold(ch: Chapter, dy: number) { const v = Math.round(dy * 10) / 10; if (ch._hold !== v) { ch._hold = v; ch.stage.style.transform = v ? `translate3d(0,${v}px,0)` : ''; } }
let bPrev: string | null = null, logO = '';
function shotAt(y: number) {
  let shot: Shot | null = null; const L = A.chapters;
  for (let i = 0; i < L.length; i++) {
    const C = L[i], N = L[i + 1] || null;
    if (y >= C.top - 2 && y <= C.top + C.span) { shot = { a: C, b: null, t: 0 }; break; }
    // a static section between two chapters (no adjacency) means no dissolve: the stage is held and the section slides over it like a curtain
    if (y > C.top + C.span && y < C.top + C.h) { const adj = N && Math.abs(N.top - (C.top + C.h)) < 4; shot = { a: C, b: adj ? N : null, t: (y - C.top - C.span) / A.H }; break; }
  }
  A.shot = shot;
  const key = shot && (shot.b || shot.t > 0) ? shot.a.id + '>' + (shot.b ? shot.b.id : '') : null;
  if (bPrev && bPrev !== key) { const [a, b] = bPrev.split('>').map(id => A.byId[id]); if (a) { hold(a, 0); a.boundOut && a.boundOut(-1); } if (b) { hold(b, 0); b.boundIn && b.boundIn(-1); } }
  bPrev = key;
  if (shot && !shot.b && shot.t > 0 && !A.rm) hold(shot.a, shot.t * A.H);
  // the HUD log belongs to the chapter on screen: it fades out first while a static section slides over the held stage
  const lo = shot && !shot.b && shot.t > 0 ? (1 - clamp(shot.t / 0.2)).toFixed(2) : '';
  if (lo !== logO) { logO = lo; const lg = $('#log'); if (lg) lg.style.opacity = lo; }
  if (shot && shot.b && !A.rm) { const { a, b, t } = shot; hold(a, t * A.H); hold(b, -(1 - t) * A.H); a.boundOut && a.boundOut(t); b.boundIn && b.boundIn(t); }
}

let lastT = 0;
export function tick(now = performance.now(), force = false) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; A.st.t += dt;
  const y = A.lenis ? A.lenis.scroll : scrollY;
  A.st.v = A.lenis ? A.lenis.velocity * 60 : 0; A.st.y = y;
  const act = chapterAt(y);
  if (act !== A.active) { const prev = A.active; A.active = act; prev && prev.leave && prev.leave(); act && act.enter && act.enter(); A.log && A.log.clear(); document.documentElement.dataset.ch = act ? act.id : ''; }
  for (const ch of A.chapters) {
    const near = y + A.H * 2.5 > ch.top && y - A.H * 1.2 < ch.top + ch.h, vis = y + A.H > ch.top && y < ch.top + ch.h;
    if (near && !ch.near && ch.warm) ch.warm();
    ch.near = near; ch.vis = vis;
    if (vis || force) { ch.p = progressOf(ch, y); ch.frame && ch.frame(ch.p, dt, A.st.t); }
  }
  shotAt(y);
  const tot = document.documentElement.scrollHeight - A.H, pu = $('#prog u'); if (pu) pu.style.width = (100 * clamp(y / Math.max(1, tot))) + '%';
  for (const f of A.after) f(dt);
  A.gl && A.gl.render(dt);
}

export function startScroll() {
  if (!A.rm) {
    A.lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, autoRaf: false });
    gsap.ticker.add((t: number) => { A.st.f++; A.lenis!.raf(t * 1000); tick(); });
  } else gsap.ticker.add(() => { A.st.f++; tick(); });
  gsap.ticker.lagSmoothing(0);
  addEventListener('pointermove', e => { A.st.mouse.x = e.clientX; A.st.mouse.y = e.clientY; A.st.mouse.has = true; }, { passive: true });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { measure(); A.chapters.forEach(c => c.resize && c.resize()); tick(performance.now(), true); }, 120); });
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); const t = id && id.length > 1 ? document.querySelector(id) : null; if (!t) return;
    e.preventDefault(); A.lenis ? A.lenis.scrollTo(t as HTMLElement, { duration: 1.6 }) : (t as HTMLElement).scrollIntoView();
  }));
}
export const scrollToY = (y: number) => { if (A.lenis) A.lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); };
// The two forced ticks of a review jump. They paint no frame of their own (A.st.f does not move), so what follows its target one step per rendered frame could never get there through them: with `snap` it arrives at
// once, for the length of the ticks only (the real ticker never sets it, and a throw cannot leave it set).
const forcedTicks = (snap: boolean) => { A.st.snap = snap; try { tick(performance.now(), true); tick(performance.now() + 16, true); } finally { A.st.snap = false; } };
// Review hook for automated screenshots: jump a chapter to progress p. The picture is the settled one (row A's padding in chapter 04 is where a reader would find it once the page stopped moving). A probe of layout
// shifts that wants the reader's own limit on that padding (at most PAD_STEP px per rendered frame: a 9 px jump in one frame is the hook's doing, not the page's) passes snap = false.
(globalThis as any).__v3Go = (id: string, p: number, snap = true) => {
  const ch = A.byId[id]; if (!ch) return -1;
  const y = p > 1 ? ch.top + ch.span + (p - 1) * A.H : ch.top + p * ch.span;
  scrollToY(y); forcedTicks(snap); return y;
};
// Same, by scroll position (chapters the engine does not register: the effects of src/aegis/fx). It never snaps: it is what a layout-shift probe scrolls with, and that must see what a reader's scroll does.
(globalThis as any).__v3Y = (y: number) => { scrollToY(y); forcedTicks(false); return y; };
