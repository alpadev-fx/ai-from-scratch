// 13 · PARA QUIÉN. The two lists stay where they are, the yes column and the no column, and they are made by sorting a pile: when the chapter comes into view the REAL o200k tokens of all seven lines are in a
// pile, jumbled, the tokens of the two lists mixed (the yes list's outlined in the accent), and the pile separates: each token runs into its own line, the yes tokens into the yes column and the no tokens into the
// no column, the lines nearest the pile first. The pile is parked where the lines are not there yet (the block of the yes lines when the lists are stacked, the block of both lists side by side: never over a
// heading). A line's tokens land as ONE ROW of real tokens inside the line's own box (left-aligned at the text's left, wrapped at the text's width, never one over another: a mono chip is wider than the words it
// stands for) and a line's words stay out until all of its tokens have landed: the row stands, goes out together, and then the words come in (c13-data.ts has the clocks, the schedule, the geometry and the node budget). The tokens travel in units of up to two, cut at word boundaries: a unit is ONE element and its chips are that element's two pseudo-elements (::before, ::after), the text of each read
// from a data attribute, because the contract's counter (v3-fps --nodes) counts every element a chapter adds, descendants included, and 91 (ES) or 85 (EN) chip elements would be that many nodes.
// It plays once, when the lists come well up the screen, and only if they were fully below the viewport when the engine attached (once()): what a reader meets first is the HTML's own final picture, and
// one who goes past before it played gets that. While it waits only the seven lines are transparent (nothing else is touched); the units are made when it plays, in one layer of their own at the end of the
// section (aria-hidden, decoration), and are removed, with the layer, in the very task it is done. Nothing here changes layout or writes copy: what moves is transform and opacity, every picture is a pure
// function of the tween position (the harness seeks it), and the chips' strings are the token pieces the page ships, never typed here.
import { gsap } from '../hud';
import { CAP, NODE_BUDGET, STAND, flowOf, nodeCount, pileIn, pileOf, plan, standTop, text as textAt, unit as unitAt, unitsOf } from '../c13-data';
import type { Geo, Plan, Rect, UnitSpec } from '../c13-data';
import { piecesOf, show, tokensFromPage } from '../tokens';
import { $, $$, el } from '../util';
import { effect, onWidth, once, REG } from './common';

function need(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`c13: ${msg}`); }
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

interface Line { li: HTMLElement; list: 'yes' | 'no'; node: Text; chips: string[][] }

export function initC13() {
  return effect((undo) => {
    const sec = $('#c13'), para = sec && $<HTMLElement>('.para', sec), yes = para && $<HTMLElement>('[data-col="yes"]', para), no = para && $<HTMLElement>('[data-col="no"]', para);
    const yesLines = yes && $<HTMLElement>('ul', yes), noLines = no && $<HTMLElement>('ul', no);
    need(sec && para && yes && no && yesLines && noLines, 'the .para / [data-col="yes"] / [data-col="no"] hooks, or the block of lines of each, are missing from the markup');
    // every line's REAL tokens (fail closed: a line that is not in the page's token file stops the effect, nothing is cut here) and its units
    const map = tokensFromPage();
    const lines: Line[] = ([['yes', yes], ['no', no]] as const).flatMap(([list, col]) => $$<HTMLElement>('li', col).map((li): Line => {
      const t = li.textContent ?? '', node = li.firstChild;
      need(li.childNodes.length === 1 && node instanceof Text && node.data === t, 'a line is not one text node (the effect measures where each of its words stands)');
      const pieces = piecesOf(map, t), us = unitsOf(pieces);
      return { li, list, node, chips: us.map((u) => pieces.slice(u.first, u.last + 1).map((p) => show(p[0]))) };
    }));
    need(lines.length === 7 && lines.every((l) => l.chips.length >= 1), 'the lists are not the seven lines of the page');
    need(lines.every((l) => l.chips.every((c) => c.length >= 1 && c.length <= CAP)), `a unit has no chip, or more than the ${CAP} its two pseudo-elements draw`);
    const specs: UnitSpec[] = lines.flatMap((l, item) => l.chips.map((c): UnitSpec => ({ item, chips: c.length, list: l.list }))), within = lines.flatMap((l) => l.chips.map((_, j) => j));
    const mine = lines.map((_, i) => specs.flatMap((s, k) => (s.item === i ? [k] : [])));                  // the units of each line, in the order it reads
    need(nodeCount(specs.length, lines.length) <= NODE_BUDGET, `${specs.length} units and ${lines.length} lines are more nodes than the ${NODE_BUDGET} of the contract`);

    let layer: HTMLElement | undefined, boxes: HTMLElement[] = [], P: Plan | undefined, tw: gsap.core.Tween | undefined, lastU: string[] = [], lastT: string[] = [];
    /** Where everything stands, from the page as it is now: the pile parked where the lines are not there yet (kept in view: a stacked pair of columns is taller than a screen), each line's units as one row in the
     *  line's own box (from where its words are: a Range over them, whatever the width wraps them to) and each line's distance from the pile. All of it from the layer's own corner, wherever the page puts it. */
    const measure = () => {
      const O = layer!.getBoundingClientRect(), B = para.getBoundingClientRect(), Y = yes.getBoundingClientRect(), N = no.getBoundingClientRect(), uy = yesLines.getBoundingClientRect(), un = noLines.getBoundingClientRect();
      const side = Y.right <= N.left + 1 && Math.abs(Y.top - N.top) < 2;                       // two columns side by side (a stacked pair is one above the other)
      const size = boxes.map((b) => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height }; }), rg = document.createRange();     // each unit as drawn, not offsetWidth's whole pixels: a row is never wider than the text, two units never closer than the gap
      // the block the pile is parked in: both lists' lines side by side (the band where both have lines, under the headings), the yes lines alone when stacked (the no list's heading is under them)
      const park: Rect = side ? { left: Math.min(uy.left, un.left), top: Math.max(uy.top, un.top), right: Math.max(uy.right, un.right), bottom: Math.min(uy.bottom, un.bottom) } : { left: uy.left, top: uy.top, right: uy.right, bottom: uy.bottom };
      const pile = pileIn(park, size, { hx: clamp(B.width * 0.14, 90, 150), hy: clamp(B.height * 0.22, 70, 110) }, innerHeight * 0.72), cx = pile.x, cy = pile.y;
      // each line's units stand as one row of real tokens inside the line's own box: left-aligned at the text's left, wrapped at the text's width (flowOf), the block of rows centred on the words and kept inside the box
      const rest: Array<{ x: number; y: number }> = new Array(specs.length);
      lines.forEach((l, i) => {
        rg.selectNodeContents(l.node);
        const rs = [...rg.getClientRects()].filter((q) => q.width > 0 && q.height > 0); need(rs.length > 0, 'a line has no place: its words are not drawn');
        const left = Math.min(...rs.map((q) => q.left)), mid = (Math.min(...rs.map((q) => q.top)) + Math.max(...rs.map((q) => q.bottom))) / 2, box = l.li.getBoundingClientRect();
        const ks = mine[i]!, f = flowOf(ks.map((k) => size[k]!.w), box.right - left), rowH = Math.max(...ks.map((k) => size[k]!.h)), top = standTop(box, mid, f.rows, rowH);
        ks.forEach((k, j) => { rest[k] = { x: left + f.pos[j]![0] - O.left, y: top + f.pos[j]![1] * (rowH + STAND.rowGap) - O.top }; });
      });
      const dist = lines.map((l) => { const b = l.li.getBoundingClientRect(); return Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy); });
      const g: Geo = { pile: { x: cx - O.left, y: cy - O.top, hx: pile.hx, hy: pile.hy }, box: size, rest, dist };
      P = plan(specs, g);
    };
    const draw = (x: number) => {
      boxes.forEach((b, k) => {
        const u = unitAt(P!, k, x), key = `${u.x.toFixed(1)}|${u.y.toFixed(1)}|${u.a.toFixed(3)}`;
        if (lastU[k] === key) return;
        lastU[k] = key; b.style.opacity = u.a <= 0 ? '0' : u.a >= 1 ? '1' : u.a.toFixed(3); b.style.transform = `translate3d(${u.x.toFixed(1)}px,${u.y.toFixed(1)}px,0)`;
      });
      lines.forEach((l, i) => {
        const t = textAt(P!, i, x), v = t >= 1 ? '' : t <= 0 ? '0' : t.toFixed(3);
        if (lastT[i] === v) return;
        lastT[i] = v; if (v === '') l.li.style.removeProperty('opacity'); else l.li.style.opacity = v;
      });
    };
    /** The chapter as the page has it: no chip, no layer, no inline style, no state. Safe to call at any time, any number of times. */
    const clear = () => {
      tw && tw.kill(); tw = undefined; P = undefined; boxes = []; lastU = []; lastT = [];
      layer && layer.remove(); layer = undefined;
      lines.forEach((l) => l.li.style.removeProperty('opacity')); delete para.dataset.fxS; delete REG['c13:sort'];
    };

    const o = once(para, undo, {
      arm: () => { para.dataset.fxS = 'arm'; lines.forEach((l) => { l.li.style.opacity = '0'; }); },
      play: (done) => {
        // fail open: a sorting that cannot be drawn is given back whole, never left with lines that are not there
        const off = (e: unknown) => { console.warn('[v3] chapter 13 is off:', e); done(); };
        try {
          para.dataset.fxS = 'run';
          layer = el('div', 'fxk ssv'); layer.setAttribute('aria-hidden', 'true'); sec.appendChild(layer);
          boxes = specs.map((s, k) => {
            const b = el('div', `fxk ssu ${s.list === 'yes' ? 'y' : 'n'}`);
            lines[s.item]!.chips[within[k]!]!.forEach((t, i) => b.setAttribute(`data-t${i + 1}`, t));      // its chips are its pseudo-elements: v3.css draws the text of each from here
            return b;
          });
          pileOf(specs.length).order.forEach((k) => layer!.appendChild(boxes[k]!));               // the pile's own order is its stacking: bottom first
          measure(); draw(0);
          const p = { x: 0 };
          tw = gsap.to(p, { x: P!.end, duration: P!.end, ease: 'none', onUpdate: () => { try { draw(p.x); } catch (e) { off(e); } }, onComplete: done });
          REG['c13:sort'] = tw;
        } catch (e) { off(e); }
      },
      clear,
      margin: '0px 0px -40% 0px',                                    // it plays once the lists have come well up the screen: the reader is looking at them
    });
    // a sorting that is playing when the width changes (a phone turned on its side) is given back whole: its places were measured for the old width
    undo(onWidth(() => { if (o.state() === 'run') o.clear(); }));
  });
}
