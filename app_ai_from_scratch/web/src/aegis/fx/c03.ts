// 03 · QUÉ CAMBIA. Each of the three cards gets a circular lens that opens on a few seconds of footage (V1 the report, V2 the gears, N5 the knobs): one grayscale
// WebP sprite per card, web/public/v3/lens/<data-lens>.webp, built by scripts/v3-frames.sh with LENS=1 (a few dozen KB each, not a scrubbed pack). The lens
// plates are empty, aria-hidden parts added when the engine attaches; the layout they need (a square above each card's text) is CSS under html.fxl, decided at
// that same moment, so nothing moves afterwards. The sprites are fetched when the chapter is within 1.5 screens; a lens opens once, when its card comes in AND
// its footage is decoded (until then it is a ring: a decoration never holds anything the reader reads). The footage loops ping-pong at 6 fps and drifts a little
// behind the frame as the card crosses the screen. Only clip-path, opacity and transform move on the page; the canvas inside is the footage.
import { gsap } from '../hud';
import { A } from '../state';
import { $, $$, clamp, el } from '../util';
import { belowFold, effect, onTick, onWidth, passed, REG, whenSeen } from './common';

const COLS = 3, FRAMES = 12, FPS = 6, ZOOM = 1.14;                    // the sprite scripts/v3-frames.sh writes with its defaults: 3 columns, 12 frames, 6 fps
const LOOP = [...Array(FRAMES).keys(), ...Array.from({ length: FRAMES - 2 }, (_, k) => FRAMES - 2 - k)];   // 0..11 then 10..1: the loop never cuts

type Lens = { i: number; tri: HTMLElement; id: string; box: HTMLElement; cv: HTMLCanvasElement; ring: HTMLElement; ctx: CanvasRenderingContext2D; bmp?: ImageBitmap; vis: boolean; want: boolean; open: boolean; armed: boolean; y: number; drawn: string; tw?: gsap.core.Tween; stop?: () => void };

export function initC03() {
  return effect((undo) => {
    const sec = $('#c03'), tris = sec ? $$('[data-lens]', sec) : [];
    if (!sec || tris.length !== 3) throw new Error(`c03: ${tris.length} [data-lens] cards, the effect needs 3`);
    const lenses: Lens[] = [];
    const dpr = () => Math.min(devicePixelRatio || 1, 2);

    for (const [i, tri] of tris.entries()) {
      const id = tri.dataset.lens || '';
      if (!/^[a-z0-9]+$/.test(id)) throw new Error(`c03: card ${i + 1} names no footage pack (data-lens="${id}")`);
      const box = el('div', 'fxk lens'), cv = el('canvas', 'lc') as HTMLCanvasElement, ring = el('i', 'lr');
      box.setAttribute('aria-hidden', 'true'); box.append(cv, ring);
      const ctx = cv.getContext('2d'); if (!ctx) throw new Error('c03: no 2d canvas');
      const l: Lens = { i, tri, id, box, cv, ring, ctx, vis: false, want: false, open: false, armed: false, y: 0, drawn: '' };
      tri.prepend(box); undo(() => { l.tw && l.tw.kill(); l.stop && l.stop(); l.bmp && l.bmp.close(); box.remove(); delete REG['c03:' + i]; });
      lenses.push(l);
    }

    /** The canvas matches the lens as laid out now (its CSS size times the pixel ratio); where it sits on the page is kept for the drift. */
    const size = () => {
      for (const l of lenses) {
        const w = Math.max(2, Math.round(l.box.clientWidth * dpr()));
        if (l.cv.width !== w) { l.cv.width = w; l.cv.height = w; l.drawn = ''; }
        const r = l.box.getBoundingClientRect(); l.y = r.top + scrollY + r.height / 2;
      }
    };
    size(); undo(onWidth(() => size()));

    /** One frame of the footage, scaled a little over the lens and shifted by where the card is on the screen. */
    const draw = (l: Lens, force = false) => {
      if (!l.bmp) return;
      const cell = l.bmp.width / COLS, k = clamp((l.y - A.st.y - A.H / 2) / (A.H / 2), -1, 1);
      const f = LOOP[(Math.floor(A.st.t * FPS) + l.i * 7) % LOOP.length], key = f + ':' + k.toFixed(3);
      if (!force && key === l.drawn) return; l.drawn = key;
      const sw = cell / ZOOM, sy = (cell - sw) * (0.5 - 0.5 * k), sx = (cell - sw) / 2;
      l.ctx.drawImage(l.bmp, (f % COLS) * cell + sx, Math.floor(f / COLS) * cell + sy, sw, sw, 0, 0, l.cv.width, l.cv.height);
    };

    /** Opening: the aperture grows from nothing to the whole circle while the ring settles onto it. */
    const shape = (l: Lens, e: number) => {
      l.cv.style.clipPath = e >= 1 ? '' : `circle(${(52 * e).toFixed(2)}% at 50% 50%)`;
      l.ring.style.opacity = e >= 1 ? '' : clamp(e * 2.2).toFixed(3);
      l.ring.style.transform = e >= 1 ? '' : `scale(${(1 + 0.22 * (1 - e)).toFixed(4)})`;
    };
    const tryOpen = (l: Lens, instant = false) => {
      if (l.open || !l.bmp || !(l.want || instant)) return;
      l.open = true; draw(l, true);
      if (!l.armed || instant) { shape(l, 1); return; }
      const p = { v: 0 };
      l.tw = gsap.to(p, { v: 1, duration: 1.15, delay: l.i * 0.12, ease: 'power3.out', onUpdate: () => shape(l, p.v), onComplete: () => { l.tw = undefined; shape(l, 1); } });
      REG['c03:' + l.i] = l.tw;
    };

    // closed (an empty ring) only while the card is fully below the viewport; a card already in view shows its footage as soon as it is decoded
    for (const l of lenses) {
      l.armed = belowFold(l.tri); if (l.armed) shape(l, 0);
      l.stop = whenSeen(l.tri, () => { l.want = true; l.stop = undefined; tryOpen(l); }, '0px 0px -12% 0px');
      const io = new IntersectionObserver((es) => { l.vis = es.some((x) => x.isIntersecting); }, { rootMargin: '8% 0px' }); io.observe(l.tri); undo(() => io.disconnect());
    }

    // the footage: fetched when the chapter is within 1.5 screens of the viewport, decoded once, one request per card
    const ac = new AbortController(); undo(() => ac.abort());
    const fetchAll = () => {
      for (const l of lenses) {
        fetch(`/v3/lens/${l.id}.webp`, { signal: ac.signal })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((b) => createImageBitmap(b))
          .then((bmp) => {
            if (ac.signal.aborted) { bmp.close(); return; }
            if (bmp.width % COLS || bmp.height !== (bmp.width / COLS) * Math.ceil(FRAMES / COLS)) throw new Error(`the sprite is ${bmp.width}x${bmp.height}, not ${COLS} columns of ${FRAMES} square frames`);
            l.bmp = bmp; tryOpen(l);
          })
          .catch((e) => { if (!ac.signal.aborted) console.warn(`[v3] the lens footage "${l.id}" did not load (the card keeps its ring):`, e); });
      }
    };
    const near = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { near.disconnect(); fetchAll(); } }, { rootMargin: '150% 0px' });
    near.observe(sec); undo(() => near.disconnect());

    undo(onTick(() => {
      for (const l of lenses) {
        if (!l.open && l.bmp && passed(l.tri)) tryOpen(l, true);       // the reader went by before it opened: it is open, not an empty ring behind them
        if (l.open && l.vis) draw(l);
      }
    }));
  });
}
