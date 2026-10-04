// 05 · CIFRAS, the drawings. Under five of the six figures sits a drawing of the process it measures (src/components/V3Viz.astro): examples going into a learner (100.000), the error falling
// with practice (94 → 23 → 4), a grid of dials being turned (70.000.000.000), weights that are trained once and then frozen while answers go by (1 vez), the options of the next token adding
// up to 100 (31 de 100). Each plays ONCE, for about two seconds, when its card comes into view (in the pinned track, when the card has come well in from the right; in the static grid, when
// it is on the screen). The markup is the finished picture: the effect only plays it, and dispose() gives it back exactly. Nothing here writes copy and nothing counts or measures: the drawings
// say ILUSTRATIVO.
// What it writes is transform, opacity and clip-path (plus the custom properties --fx-r, the angle of a dial, and --fx-l, how lit a weight is, which an overlay turns into an opacity). Each
// drawing is a pure function of the second it is at (draw(x): the harness seeks it). Armed (everything waiting at its start) only if its card is fully below the viewport when the engine
// attaches (once()); one the reader passes before it played is the finished picture again. It does not touch the track or the figures: that is c05.ts.
// Budget: the chapter writes a style on at most 80 nodes in a whole pass (the drawings' ~70 plus the track's own 9: the sums are in c05-data's NODES). A part that only needs to appear with
// others is revealed by its container (the ruler of the stacked bar is one clip, not eleven fades).
import { gsap } from '../hud';
import { ANSWERS, END, T } from '../c05-data';
import { $, $$, clamp, el, hash } from '../util';
import { effect, once, REG } from './common';

const out = (u: number) => 1 - Math.pow(1 - u, 3);                  // out-cubic
const out2 = (u: number) => 1 - (1 - u) * (1 - u);                  // out-quad: gentler, so a tile behind never catches the one in front
const io = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);   // in-out cubic
const seg = (x: number, a: number, d: number) => clamp((x - a) / d); // how far through [a, a+d] x is, 0..1
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wipe = (es: Array<Element | null | undefined>, ...props: string[]) => { for (const e of es) if (e) for (const p of props) (e as HTMLElement).style.removeProperty(p); };

interface Viz {
  end: number;                                                       // seconds the drawing takes
  measure(): void;                                                   // the layout as it is now (offsets: they do not see the transforms the drawing applies)
  spawn(): void;                                                     // the empty parts the drawing adds while it plays
  draw(x: number): void;                                             // the whole picture at x seconds
  clear(): void;                                                     // the finished picture back, exactly: no inline style, no added part
}
const need = (cond: unknown, msg: string) => { if (!cond) throw new Error(`c05: ${msg}`); };
const ANSWERS_N = ANSWERS;

// ---------- 01 · examples going in: tiles cross a track into a slot, which fills; the last four wait in a queue ----------
const examples = (box: HTMLElement): Viz => {
  const q = $('.vz-q', box), slot = $<HTMLElement>('.vz-s', box), fill = $<HTMLElement>('.vz-f', box), tiles = q ? $$<HTMLElement>('.vz-t', q) : [];
  const { n: N, first: FIRST, gap: GAP, cross: CROSS, sink: SINK, arrive: ARRIVE } = T.eg;
  need(q && slot && fill && tiles.length === T.eg.queue, `the examples drawing lacks its queue (${T.eg.queue} tiles), its slot or its fill`);
  let tw = 0, x0 = 0, xs = 0, rest: number[] = [], clones: HTMLElement[] = [];
  const measure = () => { tw = tiles[0].offsetWidth; x0 = -(tw + 8); xs = slot!.offsetLeft; rest = tiles.map((t) => t.offsetLeft); };
  const spawn = () => {
    clones.forEach((c) => c.remove()); clones = [];
    for (let k = 0; k < N; k++) {
      const c = el('i', 'vz-t vx'); c.setAttribute('aria-hidden', 'true');
      c.style.setProperty('--fx-a', `${Math.round(14 + 40 * hash(k * 7 + 1))}%`); c.style.setProperty('--fx-b', `${Math.round(12 + 36 * hash(k * 5 + 4))}%`);
      c.style.opacity = '0'; box.appendChild(c); clones.push(c);
    }
  };
  const draw = (x: number) => {
    clones.forEach((c, k) => {
      const t0 = FIRST + k * GAP, u = seg(x, t0, CROSS), s = seg(x, t0 + CROSS, SINK), X = lerp(x0, xs - tw * 0.35, u);
      c.style.opacity = x < t0 ? '0' : (1 - s).toFixed(3);
      c.style.transform = `translate3d(${X.toFixed(1)}px,0,0) scale(${(1 - 0.65 * s).toFixed(3)})`;
    });
    let f = 0; for (let k = 0; k < N; k++) f += out(seg(x, FIRST + k * GAP + CROSS - 0.04, 0.22)); f /= N;
    fill!.style.transform = f >= 1 ? '' : `scaleY(${f.toFixed(4)})`;
    tiles.forEach((t, j) => {                                        // the one nearest the slot arrives first
      const t0 = FIRST + (N + (tiles.length - 1 - j)) * GAP, u = out2(seg(x, t0, ARRIVE));
      if (u >= 1) { t.style.removeProperty('opacity'); t.style.removeProperty('transform'); return; }
      t.style.opacity = clamp(u * 3).toFixed(3); t.style.transform = `translate3d(${((1 - u) * (x0 - rest[j])).toFixed(1)}px,0,0)`;
    });
  };
  return { end: END.eg, measure, spawn, draw, clear: () => { clones.forEach((c) => c.remove()); clones = []; wipe([fill, ...tiles], 'opacity', 'transform'); } };
};

// ---------- 02 · the error falling: the curve is revealed left to right, each of its three points lands as the reveal reaches it ----------
const curve = (box: HTMLElement): Viz => {
  const clip = $<HTMLElement>('.vz-c', box), marks = $$<HTMLElement>('.vz-m', box), xs = marks.map((m) => parseFloat(m.dataset.x || ''));
  need(clip && marks.length === 3 && xs.every((v) => v >= 0 && v <= 1), 'the curve drawing lacks its clip or its three points (data-x between 0 and 1)');
  const { t0: T0, dur: DUR, fade: FADE } = T.curve;
  let W = 0, scan: HTMLElement | null = null;
  const draw = (x: number) => {
    const u = io(seg(x, T0, DUR));
    clip!.style.clipPath = u >= 1 ? '' : `inset(0 ${((1 - u) * 100).toFixed(2)}% 0 0)`;
    if (scan) { scan.style.transform = `translate3d(${(u * W).toFixed(1)}px,0,0)`; scan.style.opacity = (1 - seg(x, T0 + DUR, FADE)).toFixed(3); }
    marks.forEach((m, k) => {
      const a = clamp((u - xs[k] + 0.03) / 0.06);
      m.style.opacity = a >= 1 ? '' : a.toFixed(3); m.style.transform = a >= 1 ? '' : `scale(${(0.4 + 0.6 * a).toFixed(3)})`;
    });
  };
  return {
    end: END.curve, draw,
    measure: () => { W = clip!.offsetWidth; },
    spawn: () => { scan && scan.remove(); scan = el('i', 'vx vz-sc'); scan.setAttribute('aria-hidden', 'true'); scan.style.opacity = '0'; box.appendChild(scan); },
    clear: () => { scan && scan.remove(); scan = null; wipe([clip, ...marks], 'clip-path', 'opacity', 'transform'); },
  };
};

// ---------- 03 · dials being turned: a wave crosses the grid, then a second one settles every needle where the HTML has it ----------
const dials = (box: HTMLElement): Viz => {
  const cells = $$<HTMLElement>('i', box), rf = cells.map((c) => parseFloat(c.dataset.r || '')), cols = Math.round(parseFloat(getComputedStyle(box).getPropertyValue('--cols'))) || 10;
  need(cells.length >= cols && rf.every((r) => Number.isFinite(r)), 'the dials drawing lacks its dials (data-r each) or its --cols');
  const r0 = cells.map((_, i) => (hash(i * 3 + 1) * 2 - 1) * 150), r1 = rf.map((r, i) => r + (hash(i * 5 + 2) * 2 - 1) * 70);
  const { turn: P1, lag: LAG, settle: P2 } = T.dials;
  const start = (i: number) => T.dials.a0 + (i % cols) * T.dials.dx + Math.floor(i / cols) * T.dials.dy;
  const draw = (x: number) => cells.forEach((c, i) => {
    const a = start(i);
    if (x >= a + LAG + P2) { c.style.removeProperty('--fx-r'); return; }
    const ang = x < a + LAG ? lerp(r0[i], r1[i], io(seg(x, a, P1))) : lerp(r1[i], rf[i], out(seg(x, a + LAG, P2)));
    c.style.setProperty('--fx-r', `${ang.toFixed(1)}deg`);
  });
  return { end: END.dials, draw, measure: () => {}, spawn: () => {}, clear: () => wipe(cells, '--fx-r') };
};

// ---------- 04 · weights trained once, then frozen: they move (live, lit) until a sweep locks them left to right; then answers go by and nothing changes ----------
const freeze = (box: HTMLElement): Viz => {
  const wrap = $('.vz-w', box), bars = wrap ? $$<HTMLElement>('i', wrap) : [], ans = $$<HTMLElement>('.vz-a b', box);
  need(wrap && bars.length >= 8 && ans.length === ANSWERS_N, 'the weights drawing lacks its weights or its answers');
  const { train: TRAIN, sweep: SWEEP, lock: LOCK, a0: A0, agap: AGAP, adur: ADUR } = T.freeze;
  const om = bars.map((_, i) => 6 + 5 * hash(i + 11)), ph = bars.map((_, i) => 6.283 * hash(i + 23));
  const lockAt = (i: number) => TRAIN + (i / (bars.length - 1)) * SWEEP;
  let W = 0, x0 = 0, rest: number[] = [], sweep: HTMLElement | null = null;
  const draw = (x: number) => {
    bars.forEach((b, i) => {
      const F = out(seg(x, lockAt(i), LOCK)), r = lerp(0.55 + 0.45 * Math.sin(om[i] * x + ph[i]), 1, F);
      b.style.transform = F >= 1 ? '' : `scaleY(${r.toFixed(3)})`;
      b.style.setProperty('--fx-l', F >= 1 ? '0' : (1 - F).toFixed(3));
    });
    if (sweep) { const p = seg(x, TRAIN, SWEEP + LOCK); sweep.style.transform = `translate3d(${(p * W).toFixed(1)}px,0,0)`; sweep.style.opacity = Math.min(seg(p, 0, 0.08), 1 - seg(p, 0.92, 0.08)).toFixed(3); }
    ans.forEach((b, k) => {
      const u = out(seg(x, A0 + k * AGAP, ADUR));
      if (u >= 1) { b.style.removeProperty('opacity'); b.style.removeProperty('transform'); return; }
      b.style.opacity = clamp(u * 3).toFixed(3); b.style.transform = `translate3d(${((1 - u) * (x0 - rest[k])).toFixed(1)}px,0,0)`;
    });
  };
  return {
    end: END.freeze, draw,
    measure: () => { W = wrap!.offsetWidth; x0 = -(ans[0].offsetWidth + 8); rest = ans.map((b) => b.offsetLeft); },
    spawn: () => { sweep && sweep.remove(); sweep = el('i', 'vx vz-sc'); sweep.setAttribute('aria-hidden', 'true'); sweep.style.opacity = '0'; wrap!.appendChild(sweep); },
    clear: () => { sweep && sweep.remove(); sweep = null; wipe([...bars, ...ans], 'opacity', 'transform', '--fx-l'); },
  };
};

// ---------- 06 · the options of the next token add up to 100: the bar is revealed segment by segment, a bracket closes over the whole of it ----------
const stack = (box: HTMLElement): Viz => {
  const ruler = $<HTMLElement>('.vz-r', box), segs = $$<HTMLElement>('.vz-b i', box), sum = $<HTMLElement>('.vz-k', box);
  need(ruler && sum && segs.length === 8 && ruler.children.length >= 2, 'the stacked-bar drawing lacks its ruler, its 8 segments or its bracket');
  const { a0: A0, gap: GAP, dur: DUR, sum: SUM_DUR } = T.stack, SUM_AT = A0 + (segs.length - 1) * GAP + T.stack.close;
  const draw = (x: number) => {
    const r = out(seg(x, 0.02, 0.4)); ruler!.style.clipPath = r >= 1 ? '' : `inset(0 ${((1 - r) * 100).toFixed(2)}% 0 0)`;   // the ruler is one node: its eleven ticks are drawn by the HTML and revealed together, left to right
    segs.forEach((s, k) => { const u = out(seg(x, A0 + k * GAP, DUR)); s.style.clipPath = u >= 1 ? '' : `inset(0 ${((1 - u) * 100).toFixed(2)}% 0 0)`; });
    const b = out(seg(x, SUM_AT, SUM_DUR)); sum!.style.transform = b >= 1 ? '' : `scaleX(${b.toFixed(4)})`;
  };
  return { end: END.stack, draw, measure: () => {}, spawn: () => {}, clear: () => wipe([ruler, ...segs, sum], 'clip-path', 'transform') };
};

const KINDS: Partial<Record<string, (box: HTMLElement) => Viz>> = { eg: examples, curve, dials, freeze, stack };

export function initC05V() {
  return effect((undo) => {
    const sec = $('#c05'), boxes = sec ? $$<HTMLElement>('[data-viz]', sec) : [];
    need(sec && boxes.length === 5, `${boxes.length} [data-viz] drawings in the markup, the effect plays 5`);
    for (const box of boxes) {
      const kind = box.dataset.viz || '', make = KINDS[kind], card = box.closest<HTMLElement>('[data-fig]');
      need(make && card, `a drawing named «${kind}» that is not one of ${Object.keys(KINDS)}, or outside a [data-fig] card`);
      const v = make!(box); let tw: gsap.core.Tween | undefined;
      const clear = () => { tw && tw.kill(); tw = undefined; v.clear(); delete box.dataset.fxS; delete REG['c05:' + kind]; };
      once(card!, undo, {
        arm: () => { box.dataset.fxS = 'arm'; v.measure(); v.draw(0); },
        play: (done) => {
          box.dataset.fxS = 'run'; v.measure(); v.spawn(); v.draw(0);
          const p = { x: 0 };
          tw = gsap.to(p, { x: v.end, duration: v.end, ease: 'none', onUpdate: () => v.draw(p.x), onComplete: done });
          REG['c05:' + kind] = tw;
        },
        clear,
        margin: '0px -18% 0px 0px',                                  // in the pinned track a card plays once it has come well in from the right edge
      });
    }
  });
}
