// HUD parts: masked headline reveals (SplitText), tracking brackets with leader
// plates, data cards, the 3-line mono log and the top progress bar.
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { A, type Log } from './state';
import { $, $$, clamp, el, eo, eio, seg } from './util';

gsap.registerPlugin(SplitText, ScrambleTextPlugin);
export { gsap };
// The alphabet ScrambleText draws from. Never `<`, `>` or `&`: the plugin writes innerHTML, so they come out as entities and its reveal slices them mid-way («&l», «lt;»).
export const SCR = '01·—/‹›ABCDEF';

const heads: Array<{ redo(): void }> = [];

/** Headline that writes itself with scroll progress. p: in 0..1, pOut: out 0..1. */
export function headline(copy: HTMLElement) {
  const h = $('.head', copy), lab = $('.label', copy), rule = $('.rule', copy), sub = $('.sub', copy), cta = $('.cta', copy);
  const labSpan = lab ? $('span', lab) : null;
  let chars: HTMLElement[] = [], sp: SplitText | null = null, dirty = true, decoded = false, seen = false;
  const canSplit = !!(h && !A.rm);
  const o = {
    split() {
      dirty = false; if (!canSplit || !h) return;
      if (!h.offsetWidth) { dirty = true; return; }
      try { if (sp) sp.revert(); sp = SplitText.create(h, { type: 'lines,words,chars', mask: 'lines', linesClass: 'ln', wordsClass: 'wd', charsClass: 'chr' }); chars = sp.chars as HTMLElement[]; }
      catch { chars = []; }
      chars.forEach((c: any) => { c._v = -1; c._b = -1; });
    },
    redo() { dirty = true; },
    set(p: number, pOut = 0) {
      const ant = clamp(Math.abs(A.st.v) / 2600) * 0.12, q = clamp(p + ant), qo = clamp(pOut);
      // A headline that is fully in and not leaving is the server-rendered text the visitor is already reading (the hero's is, from the
      // first frame): leave its markup alone, no SplitText and no label scramble over visible text. It is split when it has to animate
      // (coming in, or leaving).
      if (!seen) { seen = true; if (q >= 0.999 && qo === 0) decoded = true; }
      if (dirty && (q < 0.999 || qo > 0)) o.split();
      const paper = A.paper();
      if (lab) {
        lab.style.opacity = (seg(q, 0, 0.2) * (1 - seg(qo, 0, 0.5))).toFixed(3);
        if (labSpan && !A.rm) {
          if (q > 0.02 && qo < 0.5 && !decoded) { decoded = true; const txt = labSpan.textContent || ''; gsap.to(labSpan, { duration: 0.9, ease: 'none', scrambleText: { text: txt, chars: SCR, speed: 0.6 } }); }
          else if (q <= 0.001 && decoded) decoded = false;
        }
      }
      if (chars.length) {
        const n = chars.length;
        for (let i = 0; i < n; i++) {
          const c = chars[i] as any, st = 0.06 + (i / n) * 0.5, a = eo(seg(q, st, st + 0.34));
          const so = (i / n) * 0.45, b = eio(seg(qo, so, so + 0.55)), v = a * (1 - b);
          if (Math.abs(v - c._v) < 0.002 && Math.abs(b - c._b) < 0.002) continue; c._v = v; c._b = b;
          c.style.opacity = v.toFixed(3);
          c.style.transform = `translate3d(0,${((1 - a) * 0.5 - b * 0.35).toFixed(3)}em,0)`;
          const bl = (1 - a) * 9 + b * 7; c.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : '';
          const g = Math.sin(Math.PI * clamp(a)) * (1 - b);
          c.style.textShadow = g > 0.03 ? (paper ? `0 0 ${(14 * g).toFixed(1)}px rgba(0,0,0,${(0.28 * g).toFixed(2)})` : `0 0 ${(22 * g).toFixed(1)}px rgba(255,255,255,${(0.6 * g).toFixed(2)})`) : '';
        }
      } else if (h) h.style.opacity = (eo(seg(q, 0.08, 0.6)) * (1 - seg(qo, 0, 0.6))).toFixed(3);
      if (rule) rule.style.transform = `scaleX(${(eo(seg(q, 0.45, 0.85)) * (1 - seg(qo, 0, 0.5))).toFixed(3)})`;
      for (const x of [sub, cta]) if (x) {
        const a = eo(seg(q, 0.55, 1)), b = seg(qo, 0.1, 0.7), bl = (1 - a) * 6 + b * 5;
        x.style.opacity = (a * (1 - b)).toFixed(3); x.style.transform = `translate3d(0,${((1 - a) * 14 - b * 10).toFixed(1)}px,0)`; x.style.filter = bl > 0.05 ? `blur(${bl.toFixed(1)}px)` : '';
        x.style.pointerEvents = a * (1 - b) > 0.6 ? '' : 'none';
      }
    },
  };
  heads.push(o);
  return o;
}
let rt = 0, lastW = 0;
export function watchHeads() {
  lastW = innerWidth;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => heads.forEach(x => x.redo()));
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; heads.forEach(x => x.redo()); } }, 220); });
}

/** Four corner brackets + a leader line to a mono plate. Coordinates are screen px.
 *  Everything moves with transform only (fixed-size parts, scaled fill/scan), so
 *  tracking never changes layout and cannot register as layout shift. */
export class Bracket {
  e: HTMLElement; plate: HTMLElement; lines: HTMLElement[]; ln: HTMLElement; fill: HTMLElement; scan: HTMLElement; cs: HTMLElement[]; locked = false; pw = 0; ph = 0;
  constructor(parent: HTMLElement, public label: string[], public tag?: string) {
    this.e = el('div', 'bk');
    this.e.innerHTML = '<i class="c"></i><i class="c"></i><i class="c"></i><i class="c"></i><div class="fillg"></div><div class="scan"></div><div class="ldr"></div>' +
      '<div class="plt">' + label.map(t => `<span>${t}</span>`).join('') + (tag ? `<em>${tag}</em>` : '') + '</div>';
    parent.appendChild(this.e);
    this.plate = $('.plt', this.e)!; this.ln = $('.ldr', this.e)!; this.lines = $$('.plt span', this.e);
    this.fill = $('.fillg', this.e)!; this.scan = $('.scan', this.e)!; this.cs = $$('.c', this.e);
  }
  /** r: [x0,y0,x1,y1] screen px. appear 0..1. */
  set(r: [number, number, number, number] | null, appear: number, t = 0) {
    if (!r || appear <= 0.001) { this.e.style.opacity = '0'; if (this.locked) this.locked = false; return; }
    const a = eo(clamp(appear)), grow = (1 - a) * 18;
    const x0 = r[0] - grow, y0 = r[1] - grow, x1 = r[2] + grow, y1 = r[3] + grow, w = x1 - x0, h = y1 - y0, S = 16;
    this.e.style.opacity = Math.min(1, a * 1.4).toFixed(3);
    const tr = (n: HTMLElement, x: number, y: number, extra = '') => { n.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)${extra}`; };
    tr(this.cs[0], x0, y0); tr(this.cs[1], x1 - S, y0); tr(this.cs[2], x0, y1 - S); tr(this.cs[3], x1 - S, y1 - S);
    tr(this.fill, x0, y0, ` scale(${w.toFixed(2)},${h.toFixed(2)})`);
    tr(this.scan, x0, y0 + ((t * 0.55) % 1) * h, ` scale(${w.toFixed(2)},1)`);
    if (!this.pw) { this.pw = this.plate.offsetWidth; this.ph = this.plate.offsetHeight; }
    // plate sits above the box; if no room it goes below. Always kept inside the viewport.
    const gap = 26, below = y0 - this.ph - gap < 70;
    const px = clamp(x0, 12, Math.max(12, A.W - 12 - this.pw)), py = below ? y1 + gap : y0 - this.ph - gap;
    tr(this.plate, px, py);
    tr(this.ln, clamp(x0 + 8, px + 8, px + this.pw - 8), below ? y1 : y0 - gap);
    if (a > 0.98 && !this.locked) {
      this.locked = true;
      if (!A.rm) this.lines.forEach((l, i) => { const t0 = l.textContent || ''; gsap.to(l, { duration: 0.55, delay: i * 0.08, ease: 'none', scrambleText: { text: t0, chars: SCR, speed: 0.8 } }); });
    }
  }
}

/** Data card whose markup is server-rendered; JS only animates it in. */
export function card(c: HTMLElement) {
  const parts = $$('.row', c);
  const sweep = el('div', 'sweep'); c.appendChild(sweep);
  let last = -1, boot = false;
  return {
    show(p: number) {
      const a = eo(clamp(p)); if (a === last) return; last = a;
      c.style.opacity = a > 0.001 ? '1' : '0';
      c.style.clipPath = a < 0.999 ? `inset(0 ${(100 * (1 - a)).toFixed(2)}% 0 0)` : '';
      c.style.transform = `translate3d(${((1 - a) * 28).toFixed(1)}px,0,0)`;
      parts.forEach((r, i) => { r.style.opacity = seg(a, 0.25 + i * 0.1, 0.55 + i * 0.1).toFixed(3); });
      sweep.style.left = (-40 + 180 * clamp(p * 1.2)) + '%';
      if (a > 0.35 && !boot && !A.rm) {
        boot = true;
        $$('.hd span, .row .k', c).forEach((e, i) => { const t0 = e.textContent || ''; gsap.to(e, { duration: 0.7, delay: i * 0.06, ease: 'none', scrambleText: { text: t0, chars: SCR, speed: 0.7 } }); });
      } else if (a < 0.02) boot = false;
    },
  };
}

/** Bottom-left 3-line mono log; the newest line scrambles in. */
export function makeLog(box: HTMLElement): Log {
  let key = '', lines: string[] = [];
  function render(fresh: boolean) {
    box.innerHTML = '';
    lines.slice(-3).forEach((t, i, arr) => {
      const ln = el('div', 'ln' + (fresh && i === arr.length - 1 ? ' new' : '')), sp = el('span');
      ln.appendChild(sp); box.appendChild(ln);
      if (fresh && i === arr.length - 1 && !A.rm) { gsap.to(sp, { duration: 0.9, scrambleText: { text: t, chars: SCR, speed: 0.6 }, ease: 'none' }); setTimeout(() => ln.classList.remove('new'), 1600); }
      else sp.textContent = t;
    });
  }
  return {
    set(k, list, n) { const kk = k + ':' + n; if (kk === key) return; const grow = key.startsWith(k + ':') && n > +key.split(':')[1]; key = kk; lines = list.slice(0, n); render(grow || n === 1); },
    clear() { if (!key && !lines.length) return; key = ''; lines = []; box.innerHTML = ''; },
  };
}
