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
}
export interface Shot { a: Chapter; b: Chapter | null; t: number }

export interface Runtime {
  lang: 'es' | 'en';
  rm: boolean; fx: boolean;
  W: number; H: number; mobile: boolean; dpr: number;
  chapters: Chapter[]; byId: Record<string, Chapter>;
  active: Chapter | null; shot: Shot | null;
  lenis: LenisT | null;
  st: { y: number; v: number; t: number; mouse: { x: number; y: number; has: boolean } };
  copy: any; // JSON from #v3-data
  paper: () => boolean;
  gl: import('./engine').GL | null;
  after: Array<(dt: number) => void>;
  log: Log | null;
  /** 0..1 reveal of the first headline once the ignition ends. */
  intro: number;
}
export interface Log { set(key: string, lines: string[], n: number): void; clear(): void }

export const A: Runtime = {
  lang: 'es', rm: false, fx: false, W: 1280, H: 800, mobile: false, dpr: 1,
  chapters: [], byId: {}, active: null, shot: null, lenis: null,
  st: { y: 0, v: 0, t: 0, mouse: { x: 0, y: 0, has: false } },
  copy: null, paper: () => false, gl: null, after: [], log: null, intro: 0,
};
