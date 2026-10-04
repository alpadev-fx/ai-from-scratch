// 14 · PRECIO. The price is made by its real tokens and rolls up to itself like an odometer: when the figure comes well up the screen the REAL o200k tokens of the published price («$39.990» is «$», «39», «.»,
// «990»; «39,990 COP» is «39», «,», «990», « COP») come in as square chips laid over their own characters, showing zeros, and the digits of every numeric token roll up to the price, a wheel to each digit, left to
// right, each once round and on to its own digit; the symbols are already in their chips, as the token's own text (a leading space stays a space, laid over the figure's own, so every glyph of a chip stands on the
// figure's glyph in any browser, which a «·» in the space's place would not: its advance is not the space's everywhere). A chip's edges are where its characters begin: its right edge is the left of the next
// token's first character (a browser's rect of a glyph can be a pixel wider than its advance), so the chips meet exactly. The wheels stop, the price stands as its tokens for a moment, and the real figure comes
// in underneath the chips, which fade away. Next to it the 30 segments of the bar light up, a day each (c14-data.ts has the clocks, the schedule, the geometry and the node count). The wheels are the figure's own typeface, laid on its own
// characters (v3.css gives the layer the figure's font), so the roll lands on the very glyphs it hands over to. It plays once, and only if the figure was fully below the viewport when the engine attached
// (once()): what a reader meets first is the HTML's own final picture, and one who goes past before it played gets that. While it waits only the figure and the 30 segments are transparent (nothing else is
// touched); the layer, with its chips and wheels, is made when it plays, inside the figure's block (aria-hidden, decoration, out of flow), and removed, with its styles, in the very task it is done. Nothing
// here changes layout or writes copy: what moves is transform and opacity, every picture is a pure function of the tween position (the harness seeks it), the chips' text is the token pieces the page ships and
// the wheels' digits are numbers counted here, never a string typed here. The digits that roll past are an odometer's wheels, not figures: nothing in the roll states a number other than the price.
import { gsap } from '../hud';
import { NODE_BUDGET, SEGS, boxes, figure as figureAt, nodeCount, overlay as overlayAt, plan, rows as rowsAt, seg as segAt, strip, tokensOf, wheelsOf } from '../c14-data';
import type { Geo, Plan } from '../c14-data';
import { piecesOf, tokensFromPage } from '../tokens';
import { $, $$, el } from '../util';
import { effect, onWidth, once, REG } from './common';

function need(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`c14: ${msg}`); }

export function initC14() {
  return effect((undo) => {
    const sec = $('#c14'), pbig = sec && $<HTMLElement>('.pbig', sec), fig = pbig && $<HTMLElement>('b[data-odo]', pbig), bar = sec && $<HTMLElement>('[data-segbar]', sec);
    need(sec && pbig && fig && bar, 'the .pbig / b[data-odo] / [data-segbar] hooks are missing from the markup');
    const text = fig.textContent ?? '', node = fig.firstChild;
    need(fig.childNodes.length === 1 && node instanceof Text && node.data === text, 'the figure is not one text node (the effect measures where each of its characters stands)');
    const segs = $$<HTMLElement>('i', bar);
    need(segs.length === SEGS, `the bar has ${segs.length} segments, ${SEGS} expected (one per day)`);
    // the figure's REAL tokens (fail closed: a price that is not in the page's token file stops the effect, nothing is cut here)
    const pieces = piecesOf(tokensFromPage(), text), tokens = tokensOf(pieces), wheels = wheelsOf(tokens);
    need(pieces.map((p) => p[0]).join('') === text && wheels.length >= 1, 'the figure\'s tokens are not the figure, or it has no digit to roll');
    need(nodeCount(tokens.length, wheels.length, segs.length) <= NODE_BUDGET, `${tokens.length} chips, ${wheels.length} wheels and ${segs.length} segments are more nodes than the ${NODE_BUDGET} of the contract`);

    let layer: HTMLElement | undefined, chips: HTMLElement[] = [], cols: HTMLElement[] = [], strips: HTMLElement[] = [], P: Plan | undefined, rowH = 0, tw: gsap.core.Tween | undefined;
    let lastO = '', lastF = '', lastS: string[] = [], lastR: string[] = [];
    /** Where everything stands, from the page as it is now: each character of the figure (a Range over it, whatever the width puts it at), the figure's line box, and all of it from the layer's own corner. */
    const measure = () => {
      const O = layer!.getBoundingClientRect(), F = fig.getBoundingClientRect(), rg = document.createRange();
      const rect = (a: number, b: number) => {
        rg.setStart(node, a); rg.setEnd(node, b);
        const r = rg.getClientRects()[0] ?? rg.getBoundingClientRect(); need(r && r.width > 0, 'a character of the figure has no place: it is not drawn');
        return { l: r.left - O.left, r: r.right - O.left };
      };
      const g: Geo = { fig: { y: F.top - O.top, h: F.height, fs: parseFloat(getComputedStyle(fig).fontSize) }, tok: tokens.map((t, i) => ({ l: rect(t.start, t.start + 1).l, r: i + 1 < tokens.length ? rect(t.end, t.end + 1).l : rect(t.end - 1, t.end).r })), dig: wheels.map((w) => rect(w.at, w.at + 1)) };
      const B = boxes(tokens, g);
      rowH = F.height; P = plan(tokens, segs.length);
      chips.forEach((c, i) => {
        const b = B.chips[i]!;
        c.style.transform = `translate3d(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px,0)`;
        c.style.setProperty('--fx-w', `${b.w.toFixed(2)}px`); c.style.setProperty('--fx-h', `${b.h.toFixed(2)}px`); c.style.setProperty('--fx-p', `${b.pad.toFixed(2)}px`);
      });
      cols.forEach((c, k) => { const b = B.cols[k]!; c.style.transform = `translate3d(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px,0)`; });
    };
    const share = (v: number) => (v <= 0 ? '0' : v >= 1 ? '1' : v.toFixed(3));
    const draw = (x: number) => {
      const o = share(overlayAt(P!, x)), f = share(figureAt(P!, x));
      if (o !== lastO) { lastO = o; layer!.style.opacity = o; }
      if (f !== lastF) { lastF = f; fig.style.opacity = f; }
      strips.forEach((s, k) => { const y = (-rowsAt(P!, k, x) * rowH).toFixed(2); if (lastR[k] !== y) { lastR[k] = y; s.style.transform = `translate3d(0,${y}px,0)`; } });
      segs.forEach((s, j) => { const a = share(segAt(P!, j, x)); if (lastS[j] !== a) { lastS[j] = a; s.style.opacity = a; } });
    };
    /** The chapter as the page has it: no chip, no layer, no inline style, no state. Safe to call at any time, any number of times. */
    const clear = () => {
      tw && tw.kill(); tw = undefined; P = undefined; chips = []; cols = []; strips = []; lastO = ''; lastF = ''; lastS = []; lastR = [];
      layer && layer.remove(); layer = undefined;
      fig.style.removeProperty('opacity'); segs.forEach((s) => s.style.removeProperty('opacity')); delete pbig.dataset.fxS; delete REG['c14:roll'];
    };

    const o = once(pbig, undo, {
      arm: () => { pbig.dataset.fxS = 'arm'; fig.style.opacity = '0'; segs.forEach((s) => { s.style.opacity = '0'; }); },
      play: (done) => {
        // fail open: a roll that cannot be drawn is given back whole, never left with a figure that is not there
        const off = (e: unknown) => { console.warn('[v3] chapter 14 is off:', e); done(); };
        try {
          pbig.dataset.fxS = 'run';
          layer = el('div', 'fxk odv'); layer.setAttribute('aria-hidden', 'true'); pbig.appendChild(layer);
          chips = tokens.map((t) => { const c = el('div', 'fxk odc'); if (!t.digits.length) c.textContent = t.text; layer!.appendChild(c); return c; });
          cols = wheels.map((w) => {
            const col = el('div', 'fxk odw'), s = el('div', 'fxk ods');
            s.textContent = strip(w.digit).join('\n'); col.appendChild(s); layer!.appendChild(col); strips.push(s);
            return col;
          });
          measure(); draw(0);
          const p = { x: 0 };
          tw = gsap.to(p, { x: P!.end, duration: P!.end, ease: 'none', onUpdate: () => { try { draw(p.x); } catch (e) { off(e); } }, onComplete: done });
          REG['c14:roll'] = tw;
        } catch (e) { off(e); }
      },
      clear,
      margin: '0px 0px -30% 0px',                                    // it plays once the price has come well up the screen: the reader is looking at it
    });
    // a roll that is playing when the width changes (a phone turned on its side) is given back whole: its places were measured for the old width
    undo(onWidth(() => { if (o.state() === 'run') o.clear(); }));
  });
}
