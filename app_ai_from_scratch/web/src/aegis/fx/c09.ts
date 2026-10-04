// 09 · EL TEMARIO. The twelve lessons stay where they are, in the order of the temario, and each one's title is made by the real o200k tokens it is: when a row comes into view the chips of its title
// run in from the left edge of the screen along the title's own line, in the order the title reads and all at one speed (a river), the last token first to rest at its place and each token behind it coming
// to rest against the one in front, so the river closes up into the title; the title stands as its tokens for a moment, then the chips fade out as the words fade in (c09-data.ts has the clocks, the
// schedule, the geometry and the node budget). Every lesson has its own river, started by its own row, so a reader sees each row arrive: the list is far taller than a screen. No chip changes a word:
// the title's text is in the HTML and is the text the reader ends with.
// Each row plays once, when it comes well up the screen, and only if it was fully below the viewport when the engine attached (once()): what a reader meets first is the HTML's own final picture, and a row the
// reader goes past before it played is that picture. While a row waits only its title is transparent (nothing else of it is touched); the chips are made when the row plays, live in one layer of their own at
// the end of the list (aria-hidden, decoration) and are removed in the very task the row is done; the layer goes with the last row. Nothing here changes layout: what moves is transform and opacity, and every
// picture of a row is a pure function of the tween position (the harness seeks it). The chips' strings are the token pieces the page ships, never typed here.
import { gsap } from '../hud';
import { NODE_BUDGET, T, chip, nodeCount, plain, plan, title, wrap } from '../c09-data';
import type { Plan } from '../c09-data';
import { piecesOf, show, tokensFromPage } from '../tokens';
import { $, $$, el } from '../util';
import { effect, onWidth, once, REG } from './common';

const need = (cond: unknown, msg: string) => { if (!cond) throw new Error(`c09: ${msg}`); };
const GAP = 3, LINES = 4;                                            // px between two chips of a title, and between two lines of them (a chip is 24 px tall: v3.css .irt)
const OUT = 24;                                                      // px a chip waits beyond the left edge of the screen

interface Lesson { n: string; row: HTMLElement; ih: HTMLElement; pieces: string[] }
interface Run { chips: HTMLElement[]; slot: Array<[number, number]>; plan: Plan; last: string[]; tw?: gsap.core.Tween }

export function initC09() {
  return effect((undo) => {
    const sec = $('#c09'), list = sec && $<HTMLElement>('.idx', sec), rows = list ? $$<HTMLElement>('[data-lesson]', list) : [];
    need(sec && list && rows.length === 12 && rows.every((r) => $('.ih', r)), 'the .idx / twelve [data-lesson] rows with their .ih title are missing from the markup');
    // every title's REAL tokens (fail closed: a title that is not in the page's token file stops the effect, nothing is cut here)
    const map = tokensFromPage();
    const lessons: Lesson[] = rows.map((row) => {
      const ih = $<HTMLElement>('.ih', row)!, pieces = piecesOf(map, ih.textContent ?? '').map((p) => show(p[0]));
      return { n: row.dataset.lesson ?? '', row, ih, pieces };
    });
    need(nodeCount(lessons.reduce((s, l) => s + l.pieces.length, 0), lessons.length) <= NODE_BUDGET, `more nodes than the ${NODE_BUDGET} of the contract`);

    // the one layer the chips live in: made by the first row that plays, and kept (empty, a point with no size) while any row is still waiting or playing, so a list read row by row makes one layer and not twelve;
    // it goes with the last row. `ones` is each row's once(): its state says whether the row is done (static), waiting (arm) or playing (run)
    const ones: Array<ReturnType<typeof once>> = [], began: number[] = [];
    let layer: HTMLElement | undefined;
    const layerOf = () => { if (!layer) { layer = el('div', 'fxk irv'); layer.setAttribute('aria-hidden', 'true'); list!.appendChild(layer); } return layer; };
    const release = () => { if (layer && !layer.firstChild && ones.every((o) => o.state() === 'static')) { layer.remove(); layer = undefined; } };
    const runs = new Map<Lesson, Run>();

    /** Where everything stands, from the page as it is now: each chip's place (relative to the layer's own corner, wherever the page puts it) from the title's box and the chips' widths, and so how far each one has to run. */
    const measure = (l: Lesson, s: Run) => {
      const O = layer!.getBoundingClientRect(), H = l.ih.getBoundingClientRect(), ox = O.left, oy = O.top;
      const w = s.chips.map((c) => c.offsetWidth), lineH = s.chips[0]!.offsetHeight + LINES, at = wrap(w, H.width, GAP, lineH);
      // chips that need a second line, where the paragraph of the lesson starts right under the title (the stacked list of a phone), would stand over its words: that title has no chips, its words just come in
      const P = $('p', l.row)?.getBoundingClientRect();
      if (at.lines > 1 && P && P.top >= H.bottom - 1 && P.left < H.right && P.top - H.top < at.h - LINES) { s.chips.forEach((c) => c.remove()); s.chips = []; s.slot = []; s.plan = plain; return; }
      s.slot = at.pos.map(([x, y]) => [H.left - ox + x, H.top - oy + y]);
      s.plan = plan(s.slot.map(([x], k) => x + ox + w[k]! + OUT));   // a chip waits with its right edge OUT px beyond the screen's left edge: from there to its place
    };
    const draw = (l: Lesson, s: Run, x: number) => {
      s.chips.forEach((c, k) => {
        const u = chip(s.plan, k, x), X = s.slot[k]![0] - u.r, key = `${X.toFixed(1)}|${u.a.toFixed(3)}`;
        if (s.last[k] === key) return;
        s.last[k] = key; c.style.opacity = u.a <= 0 ? '0' : u.a >= 1 ? '1' : u.a.toFixed(3); c.style.transform = `translate3d(${X.toFixed(1)}px,${s.slot[k]![1].toFixed(1)}px,0)`;
      });
      const t = title(s.plan, x); l.ih.style.opacity = t >= 1 ? '' : t <= 0 ? '0' : t.toFixed(3);
    };
    /** The row as the page has it: no chip, no inline style, no state. Safe to call at any time, any number of times. */
    const clear = (l: Lesson) => {
      const s = runs.get(l); if (s) { s.tw && s.tw.kill(); s.chips.forEach((c) => c.remove()); runs.delete(l); }
      l.ih.style.removeProperty('opacity'); delete l.row.dataset.fxS; delete REG[`c09:${l.n}`]; release();
    };

    // rows that come into view in the same instant (a screen's worth, the first time the list is reached) start T.row apart, the top one first: one river down the list, not a wall. A row waits T.row for
    // each row above it that is up the screen and still waiting its turn, or started within the last 120 ms (whatever order the browser calls them in); a reader scrolling on row by row waits for nobody
    const due = (r: HTMLElement) => { const b = r.getBoundingClientRect(); return b.top < innerHeight * 0.8 && b.bottom > 0; };
    const lag = (i: number) => { const now = performance.now(); return lessons.filter((m, j) => j < i && (ones[j]!.state() === 'arm' ? due(m.row) : ones[j]!.state() === 'run' && now - began[j]! < 120)).length * T.row; };
    lessons.forEach((l, i) => ones.push(once(l.row, undo, {
      arm: () => { l.row.dataset.fxS = 'arm'; l.ih.style.opacity = '0'; },
      play: (done) => {
        began[i] = performance.now();
        // fail open: a row whose picture cannot be drawn is given back whole, never left with a title that is not there
        const off = (e: unknown) => { console.warn('[v3] chapter 09 is off for this row:', e); done(); };
        try {
          const lay = layerOf(), chips = l.pieces.map((p) => { const c = el('i', 'fxk irt'); c.textContent = p; lay.appendChild(c); return c; });
          const s: Run = { chips, slot: [], plan: undefined as unknown as Plan, last: [] }; runs.set(l, s); l.row.dataset.fxS = 'run';
          measure(l, s); draw(l, s, 0);
          const p = { x: 0 };
          s.tw = gsap.to(p, { x: s.plan.end, duration: s.plan.end, delay: lag(i), ease: 'none', onUpdate: () => { try { draw(l, s, p.x); } catch (e) { off(e); } }, onComplete: done });
          REG[`c09:${l.n}`] = s.tw;
        } catch (e) { off(e); }
      },
      clear: () => clear(l),
      margin: '0px 0px -20% 0px',                                    // a row plays once it has come well up the screen: the reader is looking at it
    })));
    // a row that is playing when the width changes (a phone turned on its side) is given back whole: its places were measured for the old width
    undo(onWidth(() => { ones.forEach((o) => { if (o.state() === 'run') o.clear(); }); }));
  });
}
