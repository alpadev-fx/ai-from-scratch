// Shared parts of the stage-2B chapter effects (src/aegis/fx/*). The rules every effect here obeys; scripts/v3-copy-check.mjs and the harnesses enforce them:
//   · it exists only once main.ts has attached the engine (html.fxl) and for as long as the engine does: dispose() puts the static chapter back, exactly;
//   · the copy is in the HTML before any of this loads and no effect writes copy: every string it shows is read from the DOM, never typed here;
//   · a pre-state (anything that is not the final picture) is applied only to what is fully below the viewport at the moment the effect arms, and a chapter the
//     reader passes without it having played is put in its final state at once (belowFold / passed): a reader never meets a hidden sentence;
//   · what plays changes only transform, opacity, clip-path and filter (layout is CSS under html.fxl, decided once, at attach, while the reader is at the top).
import { A } from '../state';

export interface Fx { dispose(): void }

/** Builds an effect: `setup` registers what undoes each thing it does. If it throws, everything done so far is undone and the error goes on (the chapter stays static). */
export function effect(setup: (undo: (f: () => void) => void) => void): Fx {
  const stack: Array<() => void> = [];
  const dispose = () => { while (stack.length) { try { stack.pop()!(); } catch (e) { console.warn('[v3] effect cleanup failed:', e); } } };
  try { setup((f) => { stack.push(f); }); } catch (e) { dispose(); throw e; }
  return { dispose };
}

export const belowFold = (e: Element) => e.getBoundingClientRect().top >= innerHeight;
export const passed = (e: Element) => e.getBoundingClientRect().bottom < 0;

/** Calls `cb` once, the first time `e` is inside the viewport shrunk by `margin` (IntersectionObserver rootMargin syntax). Returns the cancel. */
export function whenSeen(e: Element, cb: () => void, margin = '0px 0px -15% 0px'): () => void {
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); cb(); } }, { rootMargin: margin });
  io.observe(e); return () => io.disconnect();
}

/** The shape of every play-once effect. `arm` puts the pre-state on, and only while `at` is fully below the viewport when this runs (a section in view or above stays final);
 *  `play` runs the first time `at` is inside the viewport shrunk by `margin` (IntersectionObserver syntax) and calls `done` when the picture is final; `clear` puts back exactly what the
 *  page has (it must be safe to call at any time, any number of times). A reader who goes past before it played gets `clear` at once. Returns the state (for effects that re-measure) and `clear`. */
export function once(at: Element, undo: (f: () => void) => void, o: { arm: () => void; play: (done: () => void) => void; clear: () => void; margin?: string }) {
  let state: 'static' | 'arm' | 'run' = 'static', stop: (() => void) | undefined;
  const clear = () => { stop && stop(); stop = undefined; state = 'static'; o.clear(); };
  undo(clear);                                                       // registered first: an arm() that throws half-way is undone too
  if (belowFold(at)) { state = 'arm'; o.arm(); stop = whenSeen(at, () => { stop = undefined; state = 'run'; o.play(clear); }, o.margin); }
  let y0 = -1;                                                       // a reader who went past before it played gets the page as it is: never a pre-state left behind them
  undo(onTick(() => { if (A.st.y === y0) return; y0 = A.st.y; if (state === 'arm' && passed(at)) clear(); }));
  return { state: () => state, clear };
}

/** Pins a chapter's stage (adds the `pin` class) when everything in it fits the viewport's height, and leaves the chapter static when it does not: a phone on its side, a short window.
 *  A stage that overflows lays its content out from the top (`safe center`), so scrollHeight tells. Returns whether the chapter is pinned. Asked at attach and on every resize. */
export function setPin(sec: HTMLElement, stage: HTMLElement): boolean {
  sec.classList.add('pin');
  if (stage.scrollHeight <= stage.clientHeight + 1) return true;
  sec.classList.remove('pin'); return false;
}

/** Runs `f` after every engine tick (the engine's ticker: one clock for the page). Returns the remove. */
export function onTick(f: (dt: number) => void): () => void {
  A.after.push(f);
  return () => { const i = A.after.indexOf(f); if (i >= 0) A.after.splice(i, 1); };
}

/** `cb` when the viewport WIDTH changes (a phone's address bar changes the height all the time and moves nothing here). Returns the remove. */
export function onWidth(cb: () => void): () => void {
  let w = innerWidth, t = 0;
  const f = () => { clearTimeout(t); t = window.setTimeout(() => { if (innerWidth !== w) { w = innerWidth; cb(); } }, 160); };
  addEventListener('resize', f);
  return () => { clearTimeout(t); removeEventListener('resize', f); };
}

/** `cb` after the window is resized in ANY dimension (the page above a pinned chapter changes height with the viewport), debounced. Returns the remove. */
export function onResize(cb: () => void): () => void {
  let t = 0;
  const f = () => { clearTimeout(t); t = window.setTimeout(cb, 150); };
  addEventListener('resize', f);
  return () => { clearTimeout(t); removeEventListener('resize', f); };
}

/** `cb` when the theme changes (the toggle sets data-theme on <html>; "auto" follows the system). Returns the remove. */
export function onTheme(cb: () => void): () => void {
  const mo = new MutationObserver(cb); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener('change', cb);
  return () => { mo.disconnect(); mq.removeEventListener('change', cb); };
}

/** A theme token as a canvas colour. The tokens are plain hex / rgba values (theme-css.ts), so the computed value of <html> is usable as it is. */
export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Review hook for the harnesses (like __v3Go): the timelines each effect is playing, by name. Nothing reads it in the page. */
export const REG: Record<string, any> = ((globalThis as any).__v3Fx = (globalThis as any).__v3Fx || {});
