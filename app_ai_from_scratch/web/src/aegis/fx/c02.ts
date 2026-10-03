// 02 · TE HA PASADO. Each of the three failed answers is typed (ScrambleText) when it comes into view, then its strike draws and its lesson tag drops in.
// The typing runs on an overlay laid over the answer, not on the answer: the real sentence stays in the DOM untouched the whole time, the overlay is removed
// when it ends and the strike is drawn by empty hairlines, so the text the reader ends with is the HTML's, character for character.
// A beat is armed (hidden, waiting) only if it is fully below the viewport when the engine attaches; it plays once, when its answer comes in; a beat the reader
// passes before it played goes back to the static chapter. Nothing here changes layout: overlays are absolute, only opacity / transform / filter move.
import { gsap, SCR } from '../hud';
import { A } from '../state';
import { $, $$, clamp, el } from '../util';
import { belowFold, effect, onTick, onWidth, passed, REG, whenSeen } from './common';

type Beat = { i: number; el: HTMLElement; ia: HTMLElement; rp: HTMLElement; tag: HTMLElement; text: string; state: 'arm' | 'play' | 'done' | 'static'; stop?: () => void; tl?: gsap.core.Timeline; ty?: HTMLElement; sk: HTMLElement[] };

export function initC02() {
  return effect((undo) => {
    const chat = $('#c02 [data-chat]');
    const els = chat ? $$('[data-beat]', chat) : [];
    if (!chat || !els.length) throw new Error('c02: the [data-chat] / [data-beat] hooks are missing from the markup');
    const beats: Beat[] = [];
    for (const e of els) {
      const rp = $('[data-type][data-strike]', e), tag = $('[data-tag]', e), ia = rp && rp.closest<HTMLElement>('.ia');
      if (!rp || !tag || !ia) throw new Error('c02: a beat lacks its [data-type][data-strike] answer or its [data-tag]');
      beats.push({ i: +(e.dataset.beat ?? beats.length), el: e, ia, rp, tag, text: rp.textContent || '', state: 'static', sk: [] });
    }

    /** One hairline per line of the answer, from the live layout (a Range gives one rectangle per line). They stay as the strike: the native one is off while a beat is armed. */
    const strikes = (b: Beat) => {
      b.sk.forEach((x) => x.remove()); b.sk = [];
      const r = document.createRange(); r.selectNodeContents(b.rp);
      const o = b.ia.getBoundingClientRect();
      for (const q of Array.from(r.getClientRects())) {
        if (q.width < 2) continue;
        const i = el('i', 'sk'); i.setAttribute('aria-hidden', 'true');
        i.style.setProperty('--fx-x', (q.left - o.left).toFixed(2) + 'px'); i.style.setProperty('--fx-y', (q.top - o.top + q.height * 0.58).toFixed(2) + 'px'); i.style.setProperty('--fx-w', q.width.toFixed(2) + 'px');
        b.ia.appendChild(i); b.sk.push(i);
      }
    };
    const clear = (b: Beat) => {
      b.stop && b.stop(); b.stop = undefined; b.tl && b.tl.kill(); b.tl = undefined;
      b.ty && b.ty.remove(); b.ty = undefined; b.sk.forEach((x) => x.remove()); b.sk = [];
      gsap.set(b.tag, { clearProps: 'transform,opacity,filter' }); delete b.el.dataset.fxS;
    };
    const settle = (b: Beat) => { b.tl = undefined; b.state = 'done'; b.el.dataset.fxS = 'done'; b.sk.forEach((x) => x.style.removeProperty('transform')); gsap.set(b.tag, { clearProps: 'transform,opacity,filter' }); };

    const play = (b: Beat) => {
      b.stop = undefined; b.state = 'play';
      const ty = el('span', 'ty'), sp = el('i', 'sp'), tt = el('span', 'tt'); ty.setAttribute('aria-hidden', 'true'); ty.append(sp, tt); b.ty = ty;
      const draw = { v: 0 }, glow = { v: 1 }, dur = clamp(0.55 + b.text.length / 70, 1, 2.8);
      const tl = gsap.timeline({ onComplete: () => settle(b) }); b.tl = tl; REG['c02:' + b.i] = tl;
      tl.call(() => {                                                    // the overlay starts after the «IA» label, as the answer does
        const who = $('.who', b.ia), w = who ? who.getBoundingClientRect().width + (parseFloat(getComputedStyle(who).marginRight) || 0) : 0;
        sp.style.setProperty('--fx-w', w.toFixed(2) + 'px'); b.ia.appendChild(ty); b.el.dataset.fxS = 'type';
      });
      tl.to(tt, { duration: dur, ease: 'none', scrambleText: { text: b.text, chars: SCR, speed: 0.85, revealDelay: 0.1 } });
      tl.call(() => { b.el.dataset.fxS = 'strike'; ty.remove(); b.ty = undefined; strikes(b); });
      tl.to(draw, {
        v: 1, duration: 0.7, ease: 'none',
        onUpdate: () => { const n = b.sk.length; b.sk.forEach((x, k) => { const u = clamp(draw.v * n - k); x.style.transform = `scaleX(${(u * u * (3 - 2 * u)).toFixed(3)})`; }); },
      });
      tl.call(() => { b.el.dataset.fxS = 'drop'; });
      tl.fromTo(b.tag, { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }, '<');
      tl.to(glow, { v: 0, duration: 0.8, ease: 'power2.out', onUpdate: () => { b.tag.style.filter = glow.v > 0.02 ? `drop-shadow(0 0 ${(14 * glow.v).toFixed(1)}px color-mix(in srgb, var(--ac) 80%, transparent))` : ''; } }, '<');
    };

    undo(() => { for (const b of beats) { clear(b); b.state = 'static'; } });
    for (const b of beats) {
      if (!belowFold(b.el)) continue;                                    // already in view (or above): final, as it is
      b.state = 'arm'; b.el.dataset.fxS = 'arm';
      b.stop = whenSeen(b.ia, () => play(b), '0px 0px -12% 0px');
    }
    // a beat the reader jumped past before it played is the static one again: never a hidden answer behind them
    let y0 = -1;
    undo(onTick(() => { if (A.st.y === y0) return; y0 = A.st.y; for (const b of beats) if (b.state === 'arm' && passed(b.el)) { clear(b); b.state = 'static'; } }));
    // a new width re-wraps the answers: the finished strikes are drawn again from the new layout
    undo(onWidth(() => { for (const b of beats) if (b.state === 'done') strikes(b); }));
  });
}
