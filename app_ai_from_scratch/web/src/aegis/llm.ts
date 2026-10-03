// Δ · CÓMO PIENSA — port of AEGIS llm.js, rebuilt around the course's own example.
// "Cartagena es hermosa" splits into the tokens o200k_base (GPT-4o's vocabulary) really cuts it into, and they become
// vectors (lesson 05). The page renders those chips from src/data/v3-tokens.json (cut with tiktoken by web/scripts/v3-tokens.py), so nothing here cuts text
// by a heuristic of its own: this file reads the chips from the DOM. From the next-token step on (lessons 06, 08, 09) the context
// is specimen B's own, the dog, in real tokens too (Le | ·ped | iste | ·un | ·nombre | ...; «·» is a leading space): layers carry those pieces, the candidates (ILUSTRATIVO)
// answer THAT context, attention looks BACK only across it, the loop appends the
// sampled token to it and temperature then reshuffles the pick. A candidate name is
// never shown next to the Cartagena tokens: they are two rows that never overlap.
// The four tabs are real lessons: Tokens 05 · Siguiente token 06 · Contexto 08 · Temperatura 09.
import type * as ThreeNS from 'three';
import { A } from './state';
import { register } from './core';
import { card as _c, headline } from './hud';
import { softmax, pctText } from './specimens';
import { piecesOf, show, tokensFromPage } from './tokens';
import type { GL } from './engine';
import { $, $$, clamp, eio, eo, lerp, rng, seg, ss } from './util';

const SP = [0.1, 0.32, 0.56, 0.78, 0.94];          // stage boundaries (progress)
// The timeline below was authored over a 6.4-screen chapter and ends at p = 0.96, where the panel and the card have faded. The chapter no longer
// closes on a line after that («Dos especímenes para tocar» now points at specimens that live in chapter 08), so v3.astro gives it 6.2 screens
// (--len) and its progress is scaled to run to END of the timeline: every beat keeps the scroll it had, and no empty scroll is left at the end.
const AUTHORED = 6.4, GIVEN = 6.2, END = (GIVEN - 1) / (AUTHORED - 1);

export function initLLM(gl: GL) {
  const ch = register({ id: 'cL', rmP: 0.97 }); if (!ch) return null;
  const THREE = gl.THREE, R = gl.R, st = ch.stage, D = A.copy;
  const copy = $('.copy', st)!, chipsA = $('.chips:not(.ctx)', st)!, chipsB = $('.chips.ctx', st)!, panel = $('.steps-wrap', st)!, pCard = $('.pcard', st)!;
  const head = headline(copy);
  void _c;
  const elA = $$('.tk', chipsA), elB = $$('.tk', chipsB), sentEl = $('.sent', st) as HTMLElement, refEl = $('.tokref', st) as HTMLElement | null;
  const toks = elA.map((c) => c.textContent || '');    // row A: the Cartagena tokens (lesson 05), as many as the vocabulary cuts the sentence into
  const NQ = toks.length;
  if (NQ < 2) console.warn('[v3] row A has', NQ, 'chips');
  if (elB.length < 3) console.warn('[v3] context row has', elB.length, 'chips');
  const NB = Math.max(1, elB.length - 1), NT = NB + 1;  // row B: NB context pieces (tokens), then the sampled next token
  // word each piece came from (data-w, written by the page from the same tokenizer); the sampled token starts the next word
  const wd = elB.map((c, i) => (c.dataset.w != null ? +c.dataset.w : i)); wd[NB] = wd[NB - 1] + 1;
  const lastOf = (w: number) => { for (let i = NB; i >= 0; i--) if (wd[i] === w) return i; return -1; };
  const nW = wd[NB];                                    // number of words in the context = index of the new word
  const logA = toks.join(' | '), logB = elB.slice(0, NB).map((e) => e.textContent || '').join(' | ');   // each row's tokens, for the HUD log
  const cands = D.candidatos as Array<{ name: string; logit: number }>;
  // the chip that shows the sampled next token is what the vocabulary says comes after «…perro.»: the FIRST token of the name WITH its leading space («·Max»), read from the
  // page's real tokens (a name that is several tokens shows its first: the panel lists names, the model emits tokens)
  const TOKS = tokensFromPage(), nextTxt = cands.map((c) => show(piecesOf(TOKS, ' ' + c.name)[0][0]));
  const candRows = $$('.crow', pCard);
  const dial = $('.dial', pCard) as HTMLElement | null, dialV = $('.dialv', pCard);
  const steps = $$('li', panel);
  const rnd = rng(23);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };

  // causal attention weights over the CONTEXT row (row i looks only at j < i); its own rng keeps the cloud's look
  const rndA = rng(91);
  const ATT: number[][] = Array.from({ length: NT }, (_, i) => Array.from({ length: NT }, (_, j) => (j >= i ? 0 : Math.exp(-(i - j) * 0.45) * (0.35 + rndA()))));
  const boost = (i: number, j: number, v: number) => { if (ATT[i] && j >= 0 && j < i) ATT[i][j] += v; };
  const wboost = (a: number, b: number, v: number) => { const i = lastOf(a), j = lastOf(b); if (i >= 0 && j >= 0) boost(i, j, v); };   // between WORDS, from the last piece of each
  for (let i = 1; i < NB; i++) if (wd[i] === wd[i - 1]) boost(i, i - 1, 2);                           // the pieces of one word lean on the piece before
  // the verb leans on its subject, the dog on its owner word and on the name it was asked for, the new token on the request
  wboost(1, 0, 1.6); wboost(3, 2, 0.8); wboost(nW - 1, nW - 2, 2.2); wboost(nW - 1, 3, 1.0); wboost(nW, 1, 1.4); wboost(nW, 3, 1.2); wboost(nW, nW - 1, 0.8);
  ATT.forEach(r => { const s = r.reduce((a, b) => a + b, 0) || 1; r.forEach((v, j) => { r[j] = v / s; }); });

  // ---------- scene ----------
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
  const mkTex = (sz: number, hard: number) => { const c = document.createElement('canvas'); c.width = c.height = sz; const x = c.getContext('2d')!, g = x.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(hard, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, sz, sz); return new THREE.CanvasTexture(c); };
  const DOT = mkTex(64, 0.22), GLOWT = mkTex(128, 0.05);
  const uPR = { value: gl.PR }, uTime = { value: 0 }, uCol = { value: new THREE.Color(1, 1, 1) }, uPaper = { value: 0 };
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const mats: Array<{ m: ThreeNS.Material & { blending: ThreeNS.Blending }; add: boolean }> = [];
  const lineMat = (o = 1) => { const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthWrite: false }); mats.push({ m, add: true }); return m; };
  const dotMat = (square = false) => {
    const m = new THREE.ShaderMaterial({ uniforms: { uPR, uTime, uCol, uPaper, uTex: { value: DOT } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float aS; attribute float aA; uniform float uPR, uTime; varying float vA; varying float vS;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vS = aS;
          vA = aA * (0.8 + 0.2 * sin(uTime * (0.7 + abs(aS)) + aS * 50.0));
          gl_PointSize = vA < 0.004 ? 0.0 : uPR * ${square ? '11.0' : '(1.6 + 3.0 * abs(aS) * abs(aS))'} * clamp(12.0 / -mv.z, 0.5, 1.8); }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uCol; uniform float uPaper; varying float vA; varying float vS;
        void main(){ ${square ? `vec2 q = abs(gl_PointCoord - 0.5); float m = max(q.x, q.y); if (m > 0.42) discard; float b = vS > 0.0 ? 0.45 + 0.55 * vS : 0.16; float e = smoothstep(0.33, 0.42, m); float a = vA * (0.55 + 0.45 * b + 0.3 * e);`
          : `float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.004) discard;`}
          gl_FragColor = vec4(uCol, a); }` });
    mats.push({ m: m as any, add: true }); return m;
  };
  const VN = gl.LOW ? 420 : 900;
  const cloudP = new Float32Array(VN * 3), cloudS = new Float32Array(VN), cloudA = new Float32Array(VN);
  for (let i = 0; i < VN; i++) { cloudP.set([gauss() * 4.2, gauss() * 2.4, gauss() * 3 - 2], i * 3); cloudS[i] = rnd(); cloudA[i] = 0.25 + 0.75 * rnd(); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cloudP, 3)); cg.setAttribute('aS', new THREE.BufferAttribute(cloudS, 1)); cg.setAttribute('aA', new THREE.BufferAttribute(cloudA, 1));
  const cloudMat = dotMat(); const cloud = new THREE.Points(cg, cloudMat); cloud.frustumCulled = false; scene.add(cloud);
  // token → its two nearest cloud points (meaning is closeness)
  const nearest = (a: ThreeNS.Vector3) => { let b0 = -1, b1 = -1, d0 = 1e9, d1 = 1e9;
    for (let k = 0; k < VN; k++) { const dx = cloudP[k * 3] - a.x, dy = cloudP[k * 3 + 1] - a.y, dz = cloudP[k * 3 + 2], d = dx * dx + dy * dy + dz * dz * 0.3; if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = k; } else if (d < d1) { d1 = d; b1 = k; } }
    return [b0, b1]; };
  const nearPos = new THREE.BufferAttribute(new Float32Array(NQ * 2 * 2 * 3), 3);
  const nearL = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', nearPos), lineMat(0)); nearL.frustumCulled = false; scene.add(nearL);
  // vectors: 12 cells over each question token
  const VC = 12, vcP = new Float32Array(NQ * VC * 3), vcS = new Float32Array(NQ * VC), vcA = new Float32Array(NQ * VC);
  for (let i = 0; i < NQ * VC; i++) vcS[i] = Math.max(-1, Math.min(1, gauss() * 0.6));
  const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.BufferAttribute(vcP, 3)); vg.setAttribute('aS', new THREE.BufferAttribute(vcS, 1)); vg.setAttribute('aA', new THREE.BufferAttribute(vcA, 1));
  const vecs = new THREE.Points(vg, dotMat(true)); vecs.frustumCulled = false; scene.add(vecs);
  // attention arcs, one line per pair
  const AS = 28, arcs: Array<{ i: number; j: number; line: ThreeNS.Line; pos: ThreeNS.BufferAttribute }> = [];
  for (let i = 1; i < NT; i++) for (let j = 0; j < i; j++) {
    const pos = new THREE.BufferAttribute(new Float32Array((AS + 1) * 3), 3), g = new THREE.BufferGeometry().setAttribute('position', pos);
    const line = new THREE.Line(g, lineMat(0)); line.frustumCulled = false; line.visible = false; scene.add(line); arcs.push({ i, j, line, pos });
  }
  const pulseGeo = new THREE.BufferGeometry(); const pulseP = new Float32Array(arcs.length * 3), pulseS = new Float32Array(arcs.length).fill(1), pulseA = new Float32Array(arcs.length);
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulseP, 3)); pulseGeo.setAttribute('aS', new THREE.BufferAttribute(pulseS, 1)); pulseGeo.setAttribute('aA', new THREE.BufferAttribute(pulseA, 1));
  const pulses = new THREE.Points(pulseGeo, dotMat()); pulses.frustumCulled = false; scene.add(pulses);
  // layers: stacked plates + neurons that fire as the wave passes
  const NL = A.mobile ? 6 : 8;
  const plA: number[] = []; for (let l = 0; l < NL; l++) [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(e => plA.push(...e.slice(0, 2), l, ...e.slice(2), l));
  const plG = new THREE.BufferGeometry(); plG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NL * 4 * 2 * 3), 3));
  const planes = new THREE.LineSegments(plG, lineMat(0)); planes.frustumCulled = false; scene.add(planes);
  const MN = (gl.LOW ? 14 : 24) * NL, mnP = new Float32Array(MN * 3), mnS = new Float32Array(MN), mnA = new Float32Array(MN), mnU = new Float32Array(MN * 2);
  for (let i = 0; i < MN; i++) { mnU[i * 2] = rnd() * 2 - 1; mnU[i * 2 + 1] = rnd() * 2 - 1; mnS[i] = rnd(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mnP, 3)); mg.setAttribute('aS', new THREE.BufferAttribute(mnS, 1)); mg.setAttribute('aA', new THREE.BufferAttribute(mnA, 1));
  const neurons = new THREE.Points(mg, dotMat()); neurons.frustumCulled = false; scene.add(neurons);
  // output node: ring + beam
  const accentMat = (o = 0) => { const m = new THREE.MeshBasicMaterial({ color: 0x0A84FF, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false }); mats.push({ m: m as any, add: true }); return m; };
  const nodeRing = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.19, 64), accentMat()), nodePulse = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.18, 64), accentMat());
  const nodeCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWT, color: 0x0A84FF, opacity: 0, transparent: true, depthWrite: false })); mats.push({ m: nodeCore.material as any, add: true });
  const node = new THREE.Group(); node.add(nodeRing, nodePulse, nodeCore); scene.add(node);
  const beam = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), lineMat(0)); beam.frustumCulled = false; scene.add(beam);
  const accents = [nodeRing.material, nodePulse.material, nodeCore.material, beam.material] as any[];

  // ---------- layout ----------
  let trkW = 0; let lastW = 0, lastH = 0, gut = 24, hdrB = 64, stepsTop = 700, cardW = 262, cardTop = 600, copyBot = 0;
  const widthsA = elA.map(() => 80), widthsB = elB.map(() => 80);
  function measure() {
    const sr = st.getBoundingClientRect(), r = panel.getBoundingClientRect();
    hdrB = ($('#hdr') as HTMLElement | null)?.getBoundingClientRect().bottom || 64; gut = A.mobile ? 14 : Math.max(24, A.W * 0.04);
    stepsTop = (r.top - sr.top) || A.H * 0.8; cardW = pCard.offsetWidth || 262; cardTop = pCard.offsetTop || A.H * 0.6; copyBot = A.mobile ? Math.max(0, copy.getBoundingClientRect().bottom - sr.top) : 0; trkW = ($('.trk', pCard) as HTMLElement | null)?.clientWidth || 100;
    elA.forEach((c, i) => { widthsA[i] = (c.offsetWidth || 90); });
    // row B is always fully padded, so its widths are the text's own (the layout adds the padding); the last chip reserves the
    // room of the longest name the dial can pick (mono type: width follows character count), so the row never reflows
    elB.forEach((c, i) => { const b = c.firstElementChild as HTMLElement | null, w = b?.offsetWidth || c.offsetWidth || 70, n = Math.max(1, (b?.textContent || '').length);
      widthsB[i] = i === NB ? w * Math.max(winChars, n) / n : w; });
  }
  const S = () => 2 * 12 * Math.tan(20 * Math.PI / 180) / A.H;     // world units per px at z = 0
  const posA: Array<{ x: number; y: number }> = elA.map(() => ({ x: 0, y: 0 })), posB: Array<{ x: number; y: number }> = elB.map(() => ({ x: 0, y: 0 }));
  /** Centres a row of `count` chips in the free width; tp 0..1 = how far the sentence has split into chips.
   *  A row wider than the free width stays ONE line and shrinks (chip scale `k`, down to KMIN) so its attention arcs and
   *  its layers read along one baseline; only a row that would need less than KMIN wraps, into evenly filled lines. */
  const KMIN = 0.62;
  function rowLayout(count: number, widths: number[], rowPos: Array<{ x: number; y: number }>, tp: number, floorY = 0, tight = false) {
    const mob = A.mobile, gap = tight && mob ? 4 : lerp(mob ? 3 : 6, mob ? 6 : 16, tp);   // tight: the token row of ~10 pieces on a phone
    const left = gut, right = A.W - gut - (mob ? 0 : cardW + 28), maxW = right - left;
    const items = [] as number[]; for (let i = 0; i < count; i++) items.push(widths[i] + (mob ? 12 : 24) * tp);
    const span = (L: number[], k: number) => L.reduce((a, i, n) => a + (items[i] + (n ? gap : 0)) * k, 0);
    const all = items.map((_, i) => i);
    let lines: number[][] = [all], k = 1;
    if (span(all, 1) > maxW) {
      k = maxW / span(all, 1);
      if (k < KMIN) {                                  // too wide even shrunk: wrap into even lines, full size
        k = 1;
        for (let n = 2; n <= count; n++) { const per = Math.ceil(count / n); lines = []; for (let i = 0; i < count; i += per) lines.push(all.slice(i, i + per)); if (lines.every(L => span(L, 1) <= maxW)) break; }
      }
    }
    // on a phone the probability card sits right under the row: on a short screen the row rides up to stay clear of it
    const cx = (left + right) / 2, LH = mob ? (lines.length > 1 ? 40 : 62) : 74, half = (lines.length - 1) * LH / 2;
    const baseY = mob ? Math.max(floorY, hdrB + 24 + half, Math.min(A.H * 0.5, cardTop - 30 - half)) : A.H * 0.64;       // never under the header
    lines.forEach((L, li) => { let x = cx - span(L, k) / 2;
      L.forEach((i, n) => { if (n) x += gap * k; rowPos[i].x = x + items[i] * k / 2; rowPos[i].y = baseY + (li - (lines.length - 1) / 2) * LH; x += items[i] * k; }); });
    return k;
  }
  const ancA = elA.map(() => V3()), ancB = elB.map(() => V3());
  const _p = V3(), tmp = { x: 0, y: 0, z: 0, d: 0 };
  const proj = (w: ThreeNS.Vector3) => { _p.copy(w).project(cam); tmp.x = (_p.x + 1) / 2 * A.W; tmp.y = (1 - _p.y) / 2 * A.H; tmp.z = _p.z; tmp.d = cam.position.distanceTo(w); return tmp; };

  // sampled next token at temperature T (fixed uniform draw so it is repeatable)
  const U0 = 0.62;
  const sample = (T: number) => { const pr = softmax(cands, T); let c = 0; for (let i = 0; i < pr.length; i++) { c += pr[i]; if (U0 <= c) return i; } return 0; };
  const winChars = (() => { let m = 0; for (let T = 0.3; T <= 1.6001; T += 0.05) m = Math.max(m, nextTxt[sample(T)].length); return m; })();

  let paperPrev: boolean | null = null, tShown = -1, winShown = -1;
  function theme() {
    const paper = A.paper(); if (paper === paperPrev) return; paperPrev = paper;
    uPaper.value = paper ? 1 : 0; uCol.value.set(paper ? 0x15171b : 0xe6edf8);
    mats.forEach(({ m }) => { m.blending = paper ? THREE.NormalBlending : THREE.AdditiveBlending; m.needsUpdate = true; });
    accents.forEach(m => m.color.set(paper ? 0x0A5AD6 : 0x0A84FF));
    lines.forEach(m => m.color.set(paper ? 0x15171b : 0xe6edf8));
  }
  const lines = [nearL.material, planes.material, ...arcs.map(a => a.line.material)] as ThreeNS.LineBasicMaterial[];
  const Y = V3(0, 1, 0);
  const bez = (a: ThreeNS.Vector3, b: ThreeNS.Vector3, h: number, t: number, out: ThreeNS.Vector3) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 2 * h, u = 1 - t;
    return out.set(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y, 0);
  };
  const _q = V3(), _ea = V3(), _eb = V3();          // reused: the arcs run every frame and must not allocate

  ch.resize = () => { lastW = 0; };
  // the programs of this scene (points, squares, lines, the ring, the glow sprite) are compiled when the chapter comes near, in parallel with the page (KHR_parallel_shader_compile), not in
  // the frame that first draws it: compiled there they were one frame of 20+ ms on a throttled CPU, felt as the chapter began. A browser without the extension (Firefox) is left as it was:
  // asking three for it anyway would put a warning in its console and compile on the main thread, which is what the first draw does
  ch.warm = () => { if (R.extensions.has('KHR_parallel_shader_compile')) R.compileAsync(scene, cam).catch(() => { /* the first draw compiles them, as it always did */ }); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastW = 0; });      // the chips' widths and the copy's height are those of the loaded fonts
  ch.frame = (pRaw, dt, t) => {
    const p = pRaw * END;
    theme();
    if (lastW !== A.W || lastH !== A.H) { lastW = A.W; lastH = A.H; measure(); }
    uTime.value = t; uPR.value = gl.PR;                  // the quality ratchet may have lowered the pixel ratio: a point keeps its size in CSS px
    const mob = A.mobile, s = S(), paper = A.paper();
    // ----- copy + panels
    head.set(seg(p, 0, 0.07), seg(p, 0.1, 0.15));
    panel.style.opacity = (seg(p, 0.08, 0.13) * (1 - seg(p, 0.93, 0.96))).toFixed(3);
    steps.forEach((li, i) => { const a = SP[i], b = SP[i + 1], on = p >= a && p < b, done = p >= b; li.classList.toggle('on', on); li.classList.toggle('done', done); const u = $('u i', li) as HTMLElement; u.style.transform = `scaleX(${seg(p, a, b).toFixed(3)})`; });
    // ----- the two rows of chips: A = Cartagena tokens (they split off the sentence at p .10), B = the dog context + the sampled token
    const tpA = eo(seg(p, 0.1, 0.17));
    const kA = rowLayout(NQ, widthsA, posA, tpA, copyBot ? copyBot + 34 : 0), kB = rowLayout(NT, widthsB, posB, 1, 0, true);   // A drops below the headline copy when that runs long (EN on a phone)
    const T0 = 0.3;
    // temperature dial over stage 4: 0.30 → 1.60 → 0.70
    const T = p < SP[3] ? T0 : p < 0.87 ? lerp(T0, 1.6, eio(seg(p, SP[3], 0.87))) : lerp(1.6, 0.7, eio(seg(p, 0.87, 0.93)));
    const win = sample(T);
    // ----- camera orbit while layers are up, plus a little mouse parallax
    const orbit = Math.sin(Math.PI * seg(p, 0.3, 0.56));
    const az = (orbit * 16 + (A.st.mouse.has && !mob ? (A.st.mouse.x / A.W - 0.5) * 3 : 0)) * Math.PI / 180, el = (orbit * 8) * Math.PI / 180;
    const D12 = 12; cam.position.set(Math.sin(az) * Math.cos(el) * D12, Math.sin(el) * D12, Math.cos(az) * Math.cos(el) * D12); cam.lookAt(0, 0, 0);
    cam.aspect = A.W / A.H; cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const eC = eio(seg(p, 0.2, 0.24)) * (1 - eio(seg(p, 0.3, 0.33)));
    { // the whole sentence first; it splits into tokens at p .10
      const cx = (posA[0].x + posA[NQ - 1].x) / 2, cy = posA[0].y, so = eo(seg(p, 0.025, 0.07)) * (1 - eo(seg(p, 0.1, 0.14)));
      sentEl.style.opacity = so.toFixed(3); sentEl.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) translate(-50%,-50%)`; }
    for (let i = 0; i < NQ; i++) ancA[i].set((posA[i].x - A.W / 2) * s, (A.H / 2 - posA[i].y) * s, 0);
    for (let i = 0; i < NT; i++) ancB[i].set((posB[i].x - A.W / 2) * s, (A.H / 2 - posB[i].y) * s, 0);
    // A is up from the split until the vectors are done, then B's words arrive one by one (never both on screen), and only after
    // them, at the prediction flash (.50), the sampled token
    const visV = eo(seg(p, 0.1, 0.14)), outA = 1 - eio(seg(p, 0.296, 0.33));
    const stag = 0.024 / Math.max(1, NB - 1);        // the pieces arrive over the same window whatever their number
    const visB = (i: number) => i < NB ? eio(seg(p, 0.335 + i * stag, 0.375 + i * stag)) : i === NB ? eio(seg(p, 0.5, 0.54)) : 0;
    const lift = (mob ? 21 : 26) * s;
    // ----- cloud + near lines (stage 1)
    const cA = 0.16 + 0.85 * eC + 0.1 * seg(p, 0.0, 0.06) * (1 - seg(p, 0.14, 0.2)); cloudMat.opacity = 1; (cloud.material as any).opacity = 1;
    for (let i = 0; i < VN; i++) cloudA[i] = (0.25 + 0.75 * ((i * 7919) % 100) / 100) * cA * (paper ? 1.1 : 1);
    (cg.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    nearL.visible = eC > 0.01; (nearL.material as ThreeNS.LineBasicMaterial).opacity = 0.3 * eC;
    if (nearL.visible) { let q = 0; for (let i = 0; i < NQ; i++) nearest(ancA[i]).forEach(k => { nearPos.setXYZ(q++, ancA[i].x, ancA[i].y, ancA[i].z); nearPos.setXYZ(q++, cloudP[k * 3], cloudP[k * 3 + 1], cloudP[k * 3 + 2]); }); nearPos.needsUpdate = true; }
    // ----- vectors (stage 1)
    const vP = seg(p, 0.2, 0.26) , vo = vP * (1 - eio(seg(p, 0.28, 0.31)));
    vecs.visible = vo > 0.01;
    if (vecs.visible) for (let i = 0; i < NQ; i++) for (let c = 0; c < VC; c++) { const k = i * VC + c, show = seg(vP, c / VC * 0.6, c / VC * 0.6 + 0.3);
      vcP[k * 3] = ancA[i].x; vcP[k * 3 + 1] = ancA[i].y + lift + 0.12 + c * 0.155; vcP[k * 3 + 2] = 0; vcA[k] = show * (1 - eio(seg(p, 0.28, 0.31))) * visV; }
    (vg.attributes.position as ThreeNS.BufferAttribute).needsUpdate = true; (vg.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    // ----- layers (stage 2): they rise over the row, a compute wave crosses them
    let rowTop = 1e9, ax0 = 1e9, ax1 = -1e9;
    for (let i = 0; i < NB; i++) { rowTop = Math.min(rowTop, posB[i].y); ax0 = Math.min(ax0, ancB[i].x); ax1 = Math.max(ax1, ancB[i].x); }
    // on a short phone the row rides up clear of the card: the stack above it squeezes (g) to stay under the header
    const g = mob ? clamp(((rowTop - hdrB - 12) * s - lift - 0.44) / 2.5, 0.3, 1) : 1;
    const y0 = (A.H / 2 - rowTop) * s + lift + 0.55 * g, ys = (mob ? 0.34 : 0.46) * g;
    // plates reach 0.45 past the outer words, but never past the screen (a full-width row on a phone would push them off both edges)
    const lim = (A.W / 2 - 12) * s / 1.1;
    const x0 = Math.max(-lim, ax0 - 0.45), x1 = Math.min(lim, ax1 + 0.45);
    const lB = seg(p, SP[1], 0.42), lA = seg(p, SP[1], 0.38) * (1 - seg(p, 0.53, 0.58));
    const wave = p > 0.4 && p < 0.52 ? lerp(-1, NL + 1, seg(p, 0.4, 0.5)) : -9;
    planes.visible = neurons.visible = lA > 0.01;
    if (planes.visible) {
      const pp = planes.geometry.attributes.position as ThreeNS.BufferAttribute; let q = 0, zr = mob ? 0.75 : 1.1;
      for (let l = 0; l < NL; l++) { const bl = ss(seg(lB, l / NL * 0.8, l / NL * 0.8 + 0.2)), y = y0 + l * ys - 0.6 * (1 - bl);
        [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(e => { pp.setXYZ(q++, lerp(x0, x1, (e[0] + 1) / 2), y, e[1] * zr); pp.setXYZ(q++, lerp(x0, x1, (e[2] + 1) / 2), y, e[3] * zr); }); }
      pp.needsUpdate = true; (planes.material as ThreeNS.LineBasicMaterial).opacity = 0.55 * lA;
      for (let i = 0; i < MN; i++) { const l = i % NL, bl = ss(seg(lB, l / NL * 0.8, l / NL * 0.8 + 0.2)), w = Math.exp(-Math.pow((wave - l) / 0.55, 2));
        const fire = Math.sin(i * 91.7 + Math.floor(t * 7 + mnS[i] * 9) * 13.1) > 0.45 ? 1 : 0.35;
        mnP[i * 3] = lerp(x0, x1, (mnU[i * 2] + 1) / 2); mnP[i * 3 + 1] = y0 + l * ys - 0.6 * (1 - bl); mnP[i * 3 + 2] = mnU[i * 2 + 1] * (mob ? 0.75 : 1.1);
        mnA[i] = lA * bl * (0.1 + 1.3 * w * fire); }
      (mg.attributes.position as ThreeNS.BufferAttribute).needsUpdate = true; (mg.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    }
    const topY = y0 + (NL - 1) * ys, nodeY = topY + 0.25 + 0.25 * g;
    const predOn = seg(p, 0.42, 0.46) * (1 - seg(p, 0.55, 0.59)) + seg(p, SP[3], SP[3] + 0.03) * (1 - seg(p, 0.93, 0.96)) * 0.0;
    const nodeX = ancB[NB - 1].x;
    node.visible = beam.visible = predOn > 0.01; node.position.set(nodeX, nodeY, 0); node.quaternion.copy(cam.quaternion);
    const flash = seg(p, 0.5, 0.52);
    (nodeCore.material as ThreeNS.SpriteMaterial).opacity = predOn * (0.4 + 0.5 * (p > 0.5 ? 1 : 0)); nodeCore.scale.setScalar(0.34 + 0.14 * (p > 0.5 ? 1 - flash : 0));
    (nodeRing.material as ThreeNS.MeshBasicMaterial).opacity = predOn * 0.85; (nodePulse.material as ThreeNS.MeshBasicMaterial).opacity = predOn * (flash > 0 && flash < 1 ? (1 - flash) * 0.9 : 0); nodePulse.scale.setScalar(1 + 2.4 * eo(flash));
    const bp = beam.geometry.attributes.position as ThreeNS.BufferAttribute; bp.setXYZ(0, nodeX, topY, 0); bp.setXYZ(1, nodeX, nodeY - 0.19, 0); bp.needsUpdate = true; (beam.material as ThreeNS.LineBasicMaterial).opacity = predOn * 0.5;
    // ----- attention (stage 3): focus sweeps the context words and the new token; arcs look back only
    const env = seg(p, SP[2], 0.6) * (1 - seg(p, 0.76, 0.8)), aP = seg(p, 0.6, 0.72);
    const foc = p > 0.6 && p < 0.73 ? Math.min(NT - 1, 1 + Math.floor(aP * (NT - 1))) : -1;
    const allDim = seg(p, 0.58, 0.62) * (1 - seg(p, 0.72, 0.78)) * 0.08 + 0.02;
    const old = seg(p, 0.72, 0.78);              // the oldest tokens fall off the table
    arcs.forEach(a => {
      const v = Math.min(visB(a.i), visB(a.j)), w = ATT[a.i][a.j];
      const oldGone = (wd[a.j] < 2 ? 1 - 0.85 * old : 1);   // the first two WORDS
      const o = env * v * oldGone * ((a.i === foc ? w * 3.2 : 0) + allDim * (0.3 + w));
      a.line.visible = o > 0.004; if (!a.line.visible) return;
      (a.line.material as ThreeNS.LineBasicMaterial).opacity = Math.min(1, o);
      const h = 0.26 + 0.2 * Math.min(8, a.i - a.j);
      _ea.set(ancB[a.i].x, ancB[a.i].y + lift, 0); _eb.set(ancB[a.j].x, ancB[a.j].y + lift, 0);
      for (let k = 0; k <= AS; k++) { bez(_ea, _eb, h, k / AS, _q); a.pos.setXYZ(k, _q.x, _q.y, _q.z); }
      a.pos.needsUpdate = true;
    });
    pulses.visible = env > 0.02;
    if (pulses.visible) arcs.forEach((a, k) => { const w = ATT[a.i][a.j], on = a.i === foc ? 1 : 0, h = 0.26 + 0.2 * Math.min(8, a.i - a.j), tt = 1 - ((t * 0.55 + (k * 0.37) % 1) % 1);
      _ea.set(ancB[a.i].x, ancB[a.i].y + lift, 0); _eb.set(ancB[a.j].x, ancB[a.j].y + lift, 0);
      bez(_ea, _eb, h, tt, _q); pulseP.set([_q.x, _q.y, _q.z], k * 3); pulseA[k] = env * on * Math.min(visB(a.i), visB(a.j)) * Math.min(1, w * 3) * 0.9; });
    (pulseGeo.attributes.position as ThreeNS.BufferAttribute).needsUpdate = true; (pulseGeo.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    // ----- the factual label of the chips (real o200k tokens) rides under whichever row is on screen
    if (refEl) {
      const oA = visV * outA, oB = visB(0), onA = oA >= oB, rowP = onA ? posA : posB, n = onA ? NQ : NB;
      let cxr = 0, my = 0; for (let i = 0; i < n; i++) { cxr += rowP[i].x; my = Math.max(my, rowP[i].y); } cxr /= Math.max(1, n);
      refEl.style.transform = `translate3d(${cxr.toFixed(1)}px,${(my + (mob ? 30 : 44)).toFixed(1)}px,0) translate(-50%,0)`;
      refEl.style.opacity = Math.max(oA, oB).toFixed(3);
    }
    // ----- DOM chips over their 3D anchors
    elA.forEach((c, i) => {                       // row A: the Cartagena tokens, gone before the context arrives
      let o = visV * outA; if (p < 0.02 + i * 0.008) o = 0;
      proj(ancA[i]); if (tmp.z > 1) o = 0;
      c.style.setProperty('--pad', ((mob ? 6 : 9) * tpA).toFixed(1) + 'px');
      c.style.transform = `translate3d(${tmp.x.toFixed(1)}px,${tmp.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${(clamp(12 / Math.max(1, tmp.d), 0.7, 1.12) * kA).toFixed(3)})`;
      c.style.opacity = o.toFixed(3); c.style.visibility = o > 0.005 ? 'visible' : 'hidden';
      c.classList.toggle('on', tpA > 0.5);
    });
    elB.forEach((c, i) => {                       // row B: the dog context, then the sampled token after it
      let o = visB(i);
      proj(ancB[i]); if (tmp.z > 1) o = 0;
      const key = foc >= 0 && ATT[foc][i] > 0.2 && i < foc, isF = i === foc;
      const dim = wd[i] < 2 ? old : 0;
      c.style.setProperty('--pad', (mob ? 5 : 9) + 'px');
      c.style.transform = `translate3d(${tmp.x.toFixed(1)}px,${tmp.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${(clamp(12 / Math.max(1, tmp.d), 0.7, 1.12) * kB).toFixed(3)})`;
      c.style.opacity = (o * (1 - 0.78 * dim)).toFixed(3); c.style.visibility = o > 0.005 ? 'visible' : 'hidden';
      c.classList.toggle('on', true); c.classList.toggle('f', isF); c.classList.toggle('h', !!key); c.classList.toggle('nw', i === NB && p > 0.5 && p < 0.58);
      if (i === NB && winShown !== win) { winShown = win; const b = $('b', c)!; b.textContent = nextTxt[win]; }
    });
    // glow sprite-less: the engine's bloom does the halo; tab/steps text handled by CSS classes
    // ----- probability card (stages 2 and 4)
    const cardOn = Math.max(seg(p, 0.44, 0.48) * (1 - seg(p, 0.55, 0.58)), seg(p, SP[3], SP[3] + 0.03) * (1 - seg(p, 0.93, 0.96)));
    const fill = p < SP[3] ? seg(p, 0.46, 0.52) : 1;
    const pr = softmax(cands, T);
    candRows.forEach((row, i) => { const f = pr[i] * fill, bar = $('i', row) as HTMLElement, pv = $('.cp', row)!;
      bar.style.width = Math.max(1.2, f * 100).toFixed(1) + '%'; const txt = pctText(f); if (pv.textContent !== txt) pv.textContent = txt;
      row.classList.toggle('win', i === win && fill > 0.95); });
    if (dial) { const k = seg(p, SP[3], SP[3] + 0.03); dial.style.opacity = k.toFixed(3); (dial.querySelector('i') as HTMLElement).style.transform = `translate3d(${(clamp((T - 0.1) / 1.7) * (trkW - 2)).toFixed(1)}px,0,0)`; }
    if (dialV && Math.abs(T - tShown) > 0.004) { tShown = T; dialV.textContent = T.toFixed(2); }
    pCard.style.opacity = cardOn.toFixed(3); pCard.style.visibility = cardOn > 0.005 ? 'visible' : 'hidden';
    pCard.style.transform = mob ? `translate3d(0,${((1 - cardOn) * 14).toFixed(1)}px,0)` : `translate3d(${((1 - cardOn) * 24).toFixed(1)}px,0,0)`;
    // ----- log
    if (A.log) { const lg = [D.logVec, D.logLay, D.logAtt, D.logNext, D.logLoop]; const idx = p > 0.82 ? 5 : p > 0.62 ? 3 : p > 0.44 ? 2 : p > 0.2 ? 1 : 0; if (p > 0.12) A.log.set('cL', [(p < 0.32 ? logA : logB), ...(p > 0.2 ? [D.logVec] : []), ...(p > 0.34 ? [D.logLay] : []), ...(p > 0.46 ? [D.logNext] : []), ...(p > 0.6 ? [D.logAtt] : []), ...(p > 0.78 ? [D.tabTemp] : [])].slice(-3), 3); void lg; void idx; }
    st.dataset.stage = String(p < SP[1] ? 1 : p < SP[2] ? 2 : p < SP[3] ? 3 : 4);
    A.gl && A.gl.set('cL', {
      kind: 'scene', scene: (target) => { R.setRenderTarget(target); const [r, g, b] = gl.bg(); R.setClearColor(new THREE.Color(r, g, b), 1); R.clear(); R.render(scene, cam); },
      post: { bloom: 0.5 + 0.25 * eC + 0.3 * lA, streak: 0.55, ca: 0.0006, grain: 0.04, vign: 0.5, thr: 0.35, mb: 0.4 },
    });
  };
  ch.boundIn = (t) => { st.style.opacity = t < 0 ? '' : seg(t, 0.4, 0.8).toFixed(3); };
  void Y;
  return ch;
}
