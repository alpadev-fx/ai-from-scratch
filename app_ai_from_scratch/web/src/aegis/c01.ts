// 01 · SÍNTOMA. N1 (the printed figure shatters) then N2 (the signature) scrubbed
// by scroll inside a framed plate. HUD brackets follow the number.
import { A } from './state';
import { register } from './core';
import { Bracket, card, headline } from './hud';
import { Seq } from './seq';
import { $, clamp, eio, lerp, seg, ss } from './util';

type Box = [number, number, number, number];
// N1: normalised box of the printed number, keyed by clip second (hand-tracked, 0.5 s apart).
const NUM: Array<[number, Box]> = [
  [0, [.24, .46, .78, .54]], [.5, [.22, .48, .78, .56]], [1, [.20, .47, .80, .57]], [1.5, [.20, .51, .80, .59]], [2, [.20, .51, .82, .61]],
  [2.5, [.20, .54, .80, .65]], [3, [.16, .55, .86, .68]], [3.5, [.16, .57, .84, .72]], [4, [.08, .63, .82, .73]], [4.5, [.08, .73, .94, .83]],
  [5, [.08, .78, .94, .91]], [5.5, [.08, .87, .94, .98]],
];
const SIG: Box = [.10, .63, .62, .79]; // N2: the signature line
function boxAt(t: number): Box {
  let i = 0; while (i < NUM.length - 2 && t > NUM[i + 1][0]) i++;
  const a = NUM[i], b = NUM[i + 1], u = clamp((t - a[0]) / (b[0] - a[0]));
  return a[1].map((v, k) => lerp(v, b[1][k], u)) as Box;
}

export function initC01() {
  const ch = register({ id: 'c01', rmP: 0.62 }); if (!ch) return null;
  const st = ch.stage, copy = $('.copy', st)!, cardEl = $('.card', st)!, frame = $('.pframe', st)!, cue = $('.cue', st);
  const D = A.copy;
  const head = headline(copy), cd = card(cardEl);
  const variant: 'd' | 'm' = A.mobile ? 'm' : 'd';
  const per = variant === 'm' ? 48 : 72;
  const seq = new Seq([['n1', per], ['n2', per]], variant);
  (ch as any).seq = seq;
  const bNum = new Bracket(st, [D.cifra, D.fuente], D.ilus), bSig = new Bracket(st, [D.s1Lec, D.s1C]);
  ch.warm = () => seq.warm();
  let plate: Box = [0, 0, 1, 1], base: Box = [0, 0, 1, 1], baseKey = '';
  const layout = (p: number) => {
    const push = 1 + 0.05 * ss(p);
    let w: number, h: number, x: number, y: number;
    if (A.mobile) { const s = Math.max(A.W / 720, A.H / 1280); w = 720 * s; h = 1280 * s; x = (A.W - w) / 2; y = (A.H - h) / 2; }
    else { h = A.H * 0.86; w = h * 9 / 16; x = A.W * 0.6 - w / 2; y = (A.H - h) / 2 + 12; }
    base = [x, y, w, h];
    // push-in: scale about the plate centre
    const cx = x + w / 2, cy = y + h / 2; plate = [cx - w * push / 2, cy - h * push / 2, w * push, h * push];
    st.style.setProperty('--copyW', Math.max(260, Math.min(A.W * 0.38, x - 56 - 24)) + 'px');
  };
  ch.resize = () => layout(ch.p);
  ch.frame = (p, dt, t) => {
    layout(p);
    // global frame index over both clips
    const nAll = 2 * 72, join = 0.55;
    let fi: number;
    if (p < 0.06) fi = 0;
    else if (p < 0.5) fi = lerp(0, 71, (p - 0.06) / 0.44);
    else if (p < join + 0.05) fi = lerp(71, 72, seg(p, 0.5, 0.6));
    else if (p < 0.93) fi = lerp(72, 143, (p - 0.6) / 0.33);
    else fi = 143;
    fi = clamp(fi, 0, 143) * (seq.n - 1) / (nAll - 1);
    const inN1 = fi < (seq.n / 2);
    const tClip = (inN1 ? fi / (seq.n / 2 - 1) : (fi - seq.n / 2) / (seq.n / 2 - 1)) * 7.9;
    const shatter = Math.sin(Math.PI * seg(p, 0.24, 0.4));
    const joinB = Math.sin(Math.PI * seg(p, 0.46, 0.62));
    const out = seg(p, 0.9, 0.97);
    // plate frame (DOM) and brackets
    const bk = base.map(v => v.toFixed(0)).join(',');
    if (bk !== baseKey) { baseKey = bk; frame.style.width = base[2].toFixed(1) + 'px'; frame.style.height = base[3].toFixed(1) + 'px'; }
    frame.style.transform = `translate3d(${plate[0].toFixed(1)}px,${plate[1].toFixed(1)}px,0) scale(${(plate[2] / base[2]).toFixed(4)})`;
    const toScreen = (b: Box): Box => [plate[0] + b[0] * plate[2], plate[1] + b[1] * plate[3], plate[0] + b[2] * plate[2], plate[1] + b[3] * plate[3]];
    bNum.set(inN1 ? toScreen(boxAt(tClip)) : null, seg(p, 0.10, 0.17) * (1 - seg(p, 0.36, 0.40)), t);
    bSig.set(toScreen(SIG), seg(p, 0.70, 0.78) * (1 - out), t);
    // headline writes itself after the ignition; leaves at the end
    head.set(Math.max(seg(p, 0, 0.1), A.intro), out);
    const give = A.mobile ? seg(p, 0.06, 0.13) : seg(p, 0.46, 0.56);
    ($('.copy', st) as HTMLElement).style.opacity = (1 - (A.mobile ? 1 : 0.78) * give * (1 - out)).toFixed(3);
    copy.style.transform = `translate3d(0,${((0.5 - p) * 60 - out * 30).toFixed(1)}px,0)`;
    cd.show(seg(p, 0.56, 0.68) * (1 - out));
    if (cue) cue.style.opacity = (1 - seg(p, 0.01, 0.05)).toFixed(3);
    // one log owner per frame: two keys set in the same frame would re-render (and re-scramble) the box on every tick
    if (A.log) {
      if (p > 0.7) A.log.set('c01b', [D.s1Lec + ' · ' + D.s1C, D.logFirma], p > 0.8 ? 2 : 1);
      else { const n = p > 0.28 ? 3 : p > 0.2 ? 2 : p > 0.12 ? 1 : 0; if (n) A.log.set('c01', [D.cifra, D.fuente, D.ilus], n); else A.log.clear(); }
    }
    A.gl && A.gl.set('c01', {
      kind: 'foot', seq, f: fi, plate, fill: A.mobile ? 0 : 1,
      focus: (0.25 + 0.75 * eio(seg(p, 0, 0.12))) * (1 - 0.7 * joinB) * (1 - 0.4 * seg(p, 0.93, 1)),
      exp: 0.78 + 0.22 * seg(p, 0, 0.1),
      glitch: 0.55 * shatter + 1.0 * joinB,
      post: { bloom: 0.55 + 0.7 * shatter, streak: 0.12, ca: 0.0016 + 0.003 * shatter, grain: 0.06, vign: 0.42, thr: 0.5, mb: 1.4 },
    });
  };
  ch.boundOut = (t) => { st.style.opacity = t < 0 ? '' : (1 - seg(t, 0, 0.35)).toFixed(3); };
  return ch;
}
