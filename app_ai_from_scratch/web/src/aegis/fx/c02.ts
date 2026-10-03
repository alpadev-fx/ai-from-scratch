// 02 · TE HA PASADO. Three chat windows. When a window's answer comes into view the user's pill slides in, a dot pulses where the answer will start, the answer STREAMS token by token (the real
// o200k pieces of the string, read from #v3-tokens: src/data/v3-tokens.json) and the diagnosis tag drops in under the window. In the second window the first instruction starts inside the context
// bracket, ghost messages pass through it, and the instruction leaves it by the top and goes faint.
// The stream runs on an overlay laid over the answer, not on the answer: the real sentence stays in the DOM untouched the whole time (hidden until the stream ends), the overlay holds the same text
// (what has come, the dot, what is still to come in transparent ink) so the answer wraps exactly as it will when it is final, and it is removed when it ends: the text the reader ends with is the
// HTML's, character for character. A window is armed (hidden, waiting) only if it is fully below the viewport when the engine attaches; it plays once, when its answer comes in; one the reader passes
// before it played goes back to the static chapter. Nothing here changes layout: the overlay and the ghosts are absolute, only opacity / transform / filter move.
import { gsap } from '../hud';
import { A } from '../state';
import { piecesOf, tokensFromPage } from '../tokens';
import { $, $$, clamp, el, hash } from '../util';
import { belowFold, effect, onTick, onWidth, passed, REG, whenSeen } from './common';

type Win = {
  i: number; el: HTMLElement; ia: HTMLElement; text: string; pieces: string[]; pill: HTMLElement; tag: HTMLElement; gap?: HTMLElement; ctx?: HTMLElement; earlier?: HTMLElement;
  state: 'arm' | 'play' | 'static'; stop?: () => void; tl?: gsap.core.Timeline; ov?: HTMLElement; gh: HTMLElement[]; drop: number;
};

export function initC02() {
  return effect((undo) => {
    const sec = $('#c02'), chat = sec && $('[data-chat]', sec);
    const els = chat ? $$('[data-beat]', chat) : [];
    if (!sec || !chat || !els.length) throw new Error('c02: the [data-chat] / [data-beat] hooks are missing from the markup');
    const TOK = tokensFromPage();
    const wins: Win[] = [];
    for (const e of els) {
      const rp = $('[data-type]', e), tag = $('[data-tag]', e), ia = rp && rp.closest<HTMLElement>('.ia'), pill = $('.you:not(.faint)', e), box = $('[data-win]', e);
      if (!rp || !tag || !ia || !pill || !box) throw new Error('c02: a window lacks its [data-win], its pill, its [data-type] answer or its [data-tag]');
      const text = rp.textContent || '';
      wins.push({ i: +(e.dataset.beat ?? wins.length), el: e, ia, text, pieces: piecesOf(TOK, text).map((p) => p[0]), pill, tag, gap: $('.gap', e) ?? undefined, ctx: $('[data-ctx]', e) ?? undefined, earlier: $('.you.faint', e) ?? undefined, state: 'static', gh: [], drop: 0 });
    }

    /** Window 2 only: the first instruction starts inside the bracket, as far down as its own top is 14px under the bracket's, and goes up from there. Measured where the page puts it. */
    const place = (w: Win) => {
      if (!w.ctx || !w.earlier) return;
      gsap.set(w.earlier, { clearProps: 'transform' });
      const e = w.earlier.getBoundingClientRect(), c = w.ctx.getBoundingClientRect();
      w.drop = Math.max(0, c.top + 14 - e.top);
      gsap.set(w.earlier, { y: w.drop, opacity: 1 });
    };
    const arm = (w: Win) => { w.state = 'arm'; w.el.dataset.fxS = 'arm'; place(w); };
    /** The static chapter back, exactly: no overlay, no ghost, no inline transform / opacity / filter, no state. */
    const reset = (w: Win) => {
      w.stop && w.stop(); w.stop = undefined; w.tl && w.tl.kill(); w.tl = undefined;
      w.ov && w.ov.remove(); w.ov = undefined; w.gh.forEach((g) => g.remove()); w.gh = [];
      gsap.set([w.pill, w.tag, w.gap, w.earlier].filter((x): x is HTMLElement => !!x), { clearProps: 'transform,opacity,filter' });
      delete w.el.dataset.fxS; delete REG['c02:' + w.i]; w.state = 'static';
    };

    const play = (w: Win) => {
      w.stop = undefined; w.state = 'play'; w.el.dataset.fxS = 'run';
      const n = w.pieces.length, two = !!w.ctx && !!w.earlier;
      // seconds: the pill, the dot where the answer will start, the first token. The answer is done 2.4 s after the window comes in at the latest (window 2: 2.25 s, the rest 1.5 s or so).
      const T = two ? { pill: 0.72, think: 0.85, stream: 1.0 } : { pill: 0, think: 0.28, stream: 0.5 };
      const dur = two ? 1.25 : clamp(0.45 + n * 0.03, 0.9, 1.9);
      const tl = gsap.timeline({ onComplete: () => reset(w) }); w.tl = tl; REG['c02:' + w.i] = tl;

      if (two) {                                                         // the context: three ghost messages rise through the bracket, the first instruction leaves it by the top
        const H = w.ctx!.offsetHeight;
        for (const [wd, at] of [['44%', 0], ['62%', 0.12], ['36%', 0.24]] as Array<[string, number]>) {
          const g = el('i', 'gh'); g.setAttribute('aria-hidden', 'true'); g.style.setProperty('--fx-t', '8px'); g.style.setProperty('--fx-w', wd);
          w.ctx!.appendChild(g); w.gh.push(g);
          tl.fromTo(g, { y: Math.max(40, H - 46), opacity: 0 }, { y: 0, duration: 0.62, ease: 'power1.inOut' }, at);
          tl.to(g, { opacity: 0.85, duration: 0.18, ease: 'none' }, at);
          tl.to(g, { opacity: 0, duration: 0.22, ease: 'none' }, at + 0.4);
        }
        tl.to(w.earlier!, { y: 0, opacity: 0.62, duration: 0.55, ease: 'power2.inOut' }, 0.3);
        w.gap && tl.fromTo(w.gap, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 0.72);
      }

      tl.fromTo(w.pill, { x: 28, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, ease: 'power3.out' }, T.pill);

      // the dot first (the answer is on its way), then the pieces. The overlay holds the WHOLE text from the start: what has come in ink, a dot, the rest in transparent ink.
      const cum: number[] = []; let a = 0; for (const p of w.pieces) { a += p.length; cum.push(a); }
      let on!: HTMLElement, off!: HTMLElement, cur!: HTMLElement; let pos: Array<[number, number]> = [];
      tl.call(() => {
        const ov = el('span', 'ty'); on = el('span', 'on'); off = el('span', 'off'); cur = el('i', 'cur');
        ov.setAttribute('aria-hidden', 'true'); ov.append(on, off, cur); off.textContent = w.text; w.ia.appendChild(ov); w.ov = ov;
        // where the dot stands after each piece (and before the first): the overlay already holds the whole answer, so its lines are final and every position is read once, here. The dot
        // moves with transform (it is an absolute part of its own): a dot moved by layout would count as a layout shift.
        const o = ov.getBoundingClientRect(), tn = off.firstChild!, r = document.createRange(), pts: Array<[number, number]> = [];
        [0, ...cum].forEach((c, k) => {
          if (c === 0) { r.setStart(tn, 0); r.setEnd(tn, 1); } else { r.setStart(tn, c - 1); r.setEnd(tn, c); }
          const rs = r.getClientRects(), q = rs.length ? rs[rs.length - 1] : null;
          pts.push(q ? [(c === 0 ? q.left - 3 : q.right) - o.left, q.top - o.top + q.height / 2] : (pts[k - 1] ?? [0, 0]));   // a piece with no box of its own (a space that ended a line): the dot stays where it was
        });
        pos = pts;
        cur.style.transform = `translate3d(${pos[0][0].toFixed(1)}px,${pos[0][1].toFixed(1)}px,0)`;
      }, [], T.think);
      // when each piece comes (0..1): longer pieces and the ones after punctuation take a little longer, like a stream does
      const wt = w.pieces.map((p, k) => 1 + Math.min(p.length, 8) * 0.06 + (/[.,:;!?…]$/.test(p) ? 1.3 : 0) + 0.6 * hash(k + w.i * 97));
      const tot = wt.reduce((x, y) => x + y, 0), when: number[] = []; let acc = 0; for (const x of wt) { when.push(acc / tot); acc += x; }
      const prog = { k: 0 }; let shown = -1;
      tl.to(prog, {
        k: 1, duration: dur, ease: 'none',
        onUpdate: () => {
          let idx = 0; while (idx < n && when[idx] <= prog.k) idx++;
          if (idx === shown || !w.ov) return; shown = idx;
          const c = idx ? cum[idx - 1] : 0; on.textContent = w.text.slice(0, c); off.textContent = w.text.slice(c);
          cur.style.transform = `translate3d(${pos[idx][0].toFixed(1)}px,${pos[idx][1].toFixed(1)}px,0)`;
        },
      }, T.stream);

      // the answer is done: the overlay goes, the real text shows (the same pixels), the tag drops in under the window
      const end = T.stream + dur, glow = { v: 1 };
      tl.call(() => { w.ov && w.ov.remove(); w.ov = undefined; w.el.dataset.fxS = 'drop'; }, [], end);
      tl.fromTo(w.tag, { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }, end);
      tl.to(glow, { v: 0, duration: 0.8, ease: 'power2.out', onUpdate: () => { w.tag.style.filter = glow.v > 0.02 ? `drop-shadow(0 0 ${(14 * glow.v).toFixed(1)}px color-mix(in srgb, var(--ac) 80%, transparent))` : ''; } }, '<');
    };

    undo(() => { for (const w of wins) reset(w); });
    sec.dataset.fxLive = ''; undo(() => { delete sec.dataset.fxLive; });
    for (const w of wins) {
      if (!belowFold(w.el)) continue;                                    // already in view (or above): final, as it is
      arm(w);
      w.stop = whenSeen(w.ia, () => play(w), '0px 0px -12% 0px');
    }
    // a window the reader jumped past before it played is the static one again: never a hidden answer behind them
    let y0 = -1;
    undo(onTick(() => { if (A.st.y === y0) return; y0 = A.st.y; for (const w of wins) if (w.state === 'arm' && passed(w.el)) reset(w); }));
    // a new width re-wraps the windows: an armed one measures its first instruction again
    undo(onWidth(() => { for (const w of wins) if (w.state === 'arm') place(w); }));
  });
}
