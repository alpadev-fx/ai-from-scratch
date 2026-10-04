// 06 · LO QUE NO NECESITAS. The six struck words implode into particles toward the line below them, which lands: «Solo necesitas el celular.»
// This chapter REMOVES words, so it is scrubbed by the scroll and nothing else: every picture below is a function of how far the reader has scrolled through the pinned
// stage (html.fxl + the `pin` class, decided at attach), never of what happened before. The words are fully legible until 14 % of the way (and for the whole time the
// chapter is coming up the screen); scrolling back restores them exactly; the line is in the HTML all along and only its opacity, blur and scale are driven.
// The particles are sampled from the words themselves (each character's real position, drawn on a hidden canvas) and drawn on a canvas over the stage: dark squares with
// normal blending on paper, light ones on dark, a soft halo at the point they gather in. Only opacity, transform, filter and the canvas change; the layout is CSS.
import { A } from '../state';
import { $, $$, clamp, el, hash, lerp, seg, ss } from '../util';
import { effect, onResize, onTheme, onTick, setPin, token } from './common';

const A0 = 0.14, A1 = 0.17;          // the words hand over to their particles (legible before A0)
const B0 = 0.16, B1 = 0.50;          // the particles stream in
const H0 = 0.28, H1 = 0.42, H2 = 0.46, H3 = 0.60;   // the halo they gather in: up from H0 to H1, down from H2 to H3
const L0 = 0.52, L1 = 0.72;          // the line lands, while the halo is going out (never light text over a light glow) and is fully sharp, still pinned, for the last 28 % of the pin (0.45 screens)

/** A CSS colour as [r, g, b] (any notation the tokens use). */
const rgb = (c: string): [number, number, number] => {
  const x = document.createElement('canvas').getContext('2d')!; x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
};

export function initC06() {
  return effect((undo) => {
    const sec = $('#c06'), stage = sec && $('.pstage', sec), nots = stage && $('[data-nots]', stage), h2 = stage && $('[data-final]', stage);
    const words = nots ? $$('[data-word]', nots) : [];
    if (!sec || !stage || !nots || !h2 || words.length !== 6) throw new Error('c06: the .pstage / [data-nots] / six [data-word] / [data-final] hooks are missing from the markup');
    undo(() => sec.classList.remove('pin'));
    const cv = el('canvas', 'fxk imp') as HTMLCanvasElement; cv.setAttribute('aria-hidden', 'true'); stage.appendChild(cv); undo(() => cv.remove());
    const ctx = cv.getContext('2d'); if (!ctx) throw new Error('c06: no 2d canvas');
    undo(() => { words.forEach((w) => w.style.removeProperty('opacity')); for (const e of [nots, h2]) for (const k of ['opacity', 'transform', 'filter']) e.style.removeProperty(k); });

    let on = false, built = false, top = 0, span = 1, last = -1, W = 0, Hh = 0, dpr = 1, dy = 0, tx = 0, ty = 0, n = 0;
    let px = new Float32Array(0), py = new Float32Array(0), pd = new Float32Array(0), pk = new Float32Array(0), ps = new Float32Array(0);
    let bk: Float32Array[] = [], bn = new Int32Array(8);
    let c1: [number, number, number] = [255, 255, 255], c2: [number, number, number] = [235, 235, 245], ca: [number, number, number] = [10, 132, 255], paper = false;
    const colours = () => { c1 = rgb(token('--l1')); c2 = rgb(token('--l2')); ca = rgb(token('--ac')); paper = A.paper(); last = -1; };

    /** Samples the particles from the words as they are laid out now: every character is drawn on a hidden canvas at the rectangle the browser gave it (so wrapping and letter
     *  spacing are the real ones), plus the strike of each line; the opaque pixels of a grid become the particles.
     *  It is a JOB, not a function: a generator the frames pump one small step at a time (pump()), because done at once it was one frame of 40+ ms on a throttled CPU, the hitch a
     *  reader felt as the previous chapter ended. Two things keep it small: only the box the words occupy is drawn and read back (the particles are the same: nothing outside it is ink),
     *  and every layout read happens in the FIRST slice, together (the stage and the characters move with the scroll as one; read in different frames they would not agree). */
    const build = function* (): Generator<void> {
      const sr = stage.getBoundingClientRect(); W = Math.round(sr.width); Hh = Math.round(sr.height);
      type Word = { font: string; chars: Array<[string, number, number, number]>; strikes: Array<[number, number, number, number]> };
      const items: Word[] = []; let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      const grow = (l: number, t: number, r: number, b: number) => { bx0 = Math.min(bx0, l); by0 = Math.min(by0, t); bx1 = Math.max(bx1, r); by1 = Math.max(by1, b); };
      const range = document.createRange();
      for (const w of words) {
        const cs = getComputedStyle(w), node = w.firstChild; if (!node || node.nodeType !== 3) throw new Error('c06: a [data-word] is not plain text');
        const txt = node.textContent || '', it: Word = { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, chars: [], strikes: [] };
        for (let i = 0; i < txt.length; i++) {
          if (txt[i] === ' ') continue;
          range.setStart(node, i); range.setEnd(node, i + 1); const q = range.getBoundingClientRect(); if (!q.width) continue;
          it.chars.push([txt[i], q.left - sr.left, q.top - sr.top, q.height]); grow(q.left - sr.left, q.top - sr.top, q.right - sr.left, q.bottom - sr.top);
        }
        for (const q of Array.from(w.getClientRects())) { it.strikes.push([q.left - sr.left, q.top - sr.top + q.height * 0.58 - 1, q.width, 2]); grow(q.left - sr.left, q.top - sr.top, q.right - sr.left, q.bottom - sr.top); }
        items.push(it);
      }
      dpr = Math.min(devicePixelRatio || 1, 1.5); cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      yield;
      // the box the words occupy, a margin round it for the ink that leaves a character's advance box (accents, italics) and the antialiasing
      const M = 12, bx = clamp(Math.floor(bx0 - M), 0, W), by = clamp(Math.floor(by0 - M), 0, Hh), bw = clamp(Math.ceil(bx1 + M), 0, W) - bx, bh = clamp(Math.ceil(by1 + M), 0, Hh) - by;
      const off = document.createElement('canvas'); off.width = Math.max(1, bw); off.height = Math.max(1, bh);
      const g = off.getContext('2d', { willReadFrequently: true })!; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
      for (const it of items) {
        g.font = it.font;
        for (const [c, x, y, h] of it.chars) { const asc = g.measureText(c).fontBoundingBoxAscent || h * 0.8; g.fillText(c, x - bx, y - by + asc); }
        for (const [x, y, w, h] of it.strikes) g.fillRect(x - bx, y - by, w, h);
        yield;
      }
      const data = g.getImageData(0, 0, off.width, off.height).data, MAX = A.mobile ? 800 : 1700;
      yield;
      // the grid is anchored at the stage's corner, as it always was: only its points inside the box are looked at (outside it nothing is ink)
      const ink = (x: number, y: number) => data[((y - by) * off.width + (x - bx)) * 4 + 3] > 120;
      let c3 = 0;
      for (let y = Math.ceil(by / 3) * 3, k = 0; y < by + bh; y += 3) { for (let x = Math.ceil(bx / 3) * 3; x < bx + bw; x += 3) if (ink(x, y)) c3++; if (++k % 48 === 0) yield; }
      const gap = clamp(Math.ceil(3 * Math.sqrt(c3 / MAX)), 3, 10);
      const xs: number[] = [], ys: number[] = [];
      for (let y = Math.ceil(by / gap) * gap, k = 0; y < by + bh; y += gap) { for (let x = Math.ceil(bx / gap) * gap; x < bx + bw; x += gap) if (ink(x, y)) { xs.push(x); ys.push(y); } if (++k % 24 === 0) yield; }
      n = xs.length; bk = Array.from({ length: 8 }, () => new Float32Array(n * 3)); px = new Float32Array(n); py = new Float32Array(n); pd = new Float32Array(n); pk = new Float32Array(n); ps = new Float32Array(n);
      yield;
      let far = 1; for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(xs[i] - tx, ys[i] - ty));
      for (let i = 0; i < n; i++) {
        px[i] = xs[i] + (hash(i * 3 + 1) - 0.5) * gap * 0.8; py[i] = ys[i] + (hash(i * 3 + 2) - 0.5) * gap * 0.8;
        pd[i] = 0.34 * (0.6 * hash(i * 3 + 3) + 0.4 * (1 - Math.hypot(xs[i] - tx, ys[i] - ty) / far));     // the nearer to the point, the later it starts: a stream, not a wall
        pk[i] = (hash(i * 7 + 5) - 0.5) * 0.7; ps[i] = 1.6 + hash(i * 11 + 9) * 1.4;
        if (i % 400 === 399) yield;
      }
    };
    let job: Generator<void> | null = null;
    undo(() => { job = null; });
    /** One step of the build per frame (a step is a word drawn, the read-back, a few dozen rows of the grid: none is more than a millisecond of real work); the frame after it carries on where it stopped. */
    const pump = () => {
      if (!job) job = build();
      if (job.next().done) { job = null; built = true; }
    };

    /** The layout as it is now: where the pinned stage is on the page, where the line will have landed (the vertical middle of the stage) and so where the particles gather. */
    const geo = () => {
      const was = on; on = setPin(sec, stage);                       // a viewport too short for the stage (a phone on its side) leaves the static chapter
      for (const e of [nots, h2]) for (const k of ['opacity', 'transform', 'filter']) e.style.removeProperty(k);
      words.forEach((w) => w.style.removeProperty('opacity'));
      if (!on) { if (was) console.warn(`[v3] #c06: the stage no longer fits a ${innerWidth}x${innerHeight} viewport; the chapter is the static one`); built = false; return; }
      top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - stage.offsetHeight);
      const sr = stage.getBoundingClientRect(), hr = h2.getBoundingClientRect(), cs = getComputedStyle(stage);
      const mid = (parseFloat(cs.paddingTop) + sr.height - parseFloat(cs.paddingBottom)) / 2;
      dy = hr.top - sr.top + hr.height / 2 - mid; tx = hr.left - sr.left + hr.width / 2; ty = mid;
      built = false; job = null; last = -1; frame();                // a new layout: whatever was half built is of the old one
    };

    const frame = () => {
      if (!on) return;
      if (!built && A.st.y + A.H * 3.5 > top) pump();                // the pixels are read once, when the chapter is about to come up (not at attach, not while it is on screen), a few ms a frame
      if (!built) return;
      const p = clamp((A.st.y - top) / span); if (p === last) return; last = p;
      const hand = ss(seg(p, A0, A1)), q = seg(p, B0, B1), land = ss(seg(p, L0, L1));
      // the words, the panels they sit on, the line
      const wo = (1 - hand).toFixed(3); words.forEach((w) => { w.style.opacity = wo; });
      nots.style.opacity = (1 - ss(seg(p, 0.2, B1))).toFixed(3);
      h2.style.opacity = land.toFixed(3);
      h2.style.transform = `translate3d(0,${(-dy).toFixed(1)}px,0) scale(${(1.1 - 0.1 * land).toFixed(4)})`;
      h2.style.filter = land < 0.999 ? `blur(${((1 - land) * 16).toFixed(1)}px)` : '';
      // the particles
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
      if (hand <= 0 || p > H3 + 0.02) return;
      const cnt = bn; cnt.fill(0);                                  // 4 alphas x 2 colours: one fill each
      for (let i = 0; i < n; i++) {
        const t = clamp((q - pd[i]) / (1 - pd[i])), u = t * t * t * (t * (6 * t - 15) + 10);
        const x0 = px[i], y0 = py[i], dx = tx - x0, dyy = ty - y0, cx = x0 + dx / 2 - dyy * pk[i], cy = y0 + dyy / 2 + dx * pk[i], v = 1 - u;
        const x = v * v * x0 + 2 * v * u * cx + u * u * tx, y = v * v * y0 + 2 * v * u * cy + u * u * ty;
        const qa = Math.round(hand * (1 - ss(seg(t, 0.84, 1))) * 4); if (qa <= 0) continue;
        const b = (qa - 1) * 2 + (t > 0.45 ? 1 : 0), list = bk[b], at = cnt[b]; cnt[b] = at + 3;
        list[at] = x; list[at + 1] = y; list[at + 2] = ps[i] * (1 - 0.55 * u);
      }
      for (let b = 0; b < 8; b++) {
        const list = bk[b], len = cnt[b]; if (!len) continue; const c = b & 1 ? c1 : c2;
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.globalAlpha = ((b >> 1) + 1) / 4; ctx.beginPath();
        for (let k = 0; k < len; k += 3) ctx.rect(list[k] - list[k + 2] / 2, list[k + 1] - list[k + 2] / 2, list[k + 2], list[k + 2]);
        ctx.fill();
      }
      // the halo they gather in: accent on dark, a dark soft shadow on paper (never light on light)
      const core = ss(seg(p, H0, H1)) * (1 - ss(seg(p, H2, H3)));
      if (core > 0.01) {
        const r = 14 + clamp(W * 0.1, 46, 118) * core, gr = ctx.createRadialGradient(tx, ty, 0, tx, ty, r), c = paper ? c1 : ca, m = lerp(0.55, 0.16, +paper);
        gr.addColorStop(0, paper ? `rgba(${c[0]},${c[1]},${c[2]},${(0.34 * core).toFixed(3)})` : `rgba(255,255,255,${(0.9 * core).toFixed(3)})`);
        gr.addColorStop(0.35, `rgba(${c[0]},${c[1]},${c[2]},${(m * core).toFixed(3)})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(tx - r, ty - r, 2 * r, 2 * r);
      }
      ctx.globalAlpha = 1;
    };

    colours(); geo(); if (!on) throw new Error(`c06: the pinned stage does not fit a ${innerWidth}x${innerHeight} viewport; the chapter stays static`);
    undo(onResize(geo)); undo(onTheme(colours)); undo(onTick(frame));
  });
}
