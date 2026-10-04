// Shared runtime state of the /v3 engine. Created on the client by `boot()`.
import type LenisT from 'lenis';

export interface Chapter {
  id: string;
  el: HTMLElement; stage: HTMLElement;
  flow?: boolean;
  top: number; h: number; span: number;
  p: number; near: boolean; vis: boolean;
  /** Final composed state used when motion is reduced. */
  rmP?: number;
  frame?: (p: number, dt: number, t: number) => void;
  warm?: () => void;
  resize?: () => void;
  enter?: () => void; leave?: () => void;
  boundIn?: (t: number) => void; boundOut?: (t: number) => void;
  _hold?: number;
  /** register() put the `lay` class on this chapter (the hero has it in its markup): the engine took the layout, so giving it back removes it. */
  layAdded?: boolean;
}
export interface Shot { a: Chapter; b: Chapter | null; t: number }

export interface Runtime {
  lang: 'es' | 'en';
  rm: boolean; fx: boolean;
  W: number; H: number; mobile: boolean; dpr: number;
  chapters: Chapter[]; byId: Record<string, Chapter>;
  active: Chapter | null; shot: Shot | null;
  lenis: LenisT | null;
  /** y, v: scroll position and velocity; t: the engine's clock (seconds, advanced by the ticks); f: how many RENDERED frames the real ticker has run (a forced tick for a review jump does not count: it paints no frame of its own). */
  st: { y: number; v: number; t: number; f: number; mouse: { x: number; y: number; has: boolean } };
  copy: any; // JSON from #v3-data
  paper: () => boolean;
  gl: import('./engine').GL | null;
  after: Array<(dt: number) => void>;
  log: Log | null;
  /** True once the first two frames of 01's footage are decoded: from then GL draws 01's plate (until then the page shows the poster). */
  foot: boolean;
}
export interface Log { set(key: string, lines: string[], n: number): void; clear(): void }

export const A: Runtime = {
  lang: 'es', rm: false, fx: false, W: 1280, H: 800, mobile: false, dpr: 1,
  chapters: [], byId: {}, active: null, shot: null, lenis: null,
  st: { y: 0, v: 0, t: 0, f: 0, mouse: { x: 0, y: 0, has: false } },
  copy: null, paper: () => false, gl: null, after: [], log: null, foot: false,
};
