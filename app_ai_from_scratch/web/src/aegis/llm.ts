// Δ · CÓMO PIENSA — port of AEGIS llm.js, rebuilt around the course's own example.
// "Cartagena es hermosa" splits into the five tokens the real tokenizer prints
// (imported from specimens.ts, the same function the specimen uses), tokens become
// vectors, layers carry them, attention looks BACK only, the next token is a
// probability (ILUSTRATIVO) and the loop adds it; temperature then reshuffles it.
// The four tabs are real lessons: Tokens 05 · Siguiente token 06 · Contexto 08 · Temperatura 09.
import type * as ThreeNS from 'three';
import { A } from './state';
import { register } from './core';
import { card as _c, headline } from './hud';
import { softmax, pctText, tokenize } from './specimens';
import type { GL } from './engine';
import { $, $$, clamp, eio, eo, lerp, rng, seg, ss } from './util';

const SP = [0.1, 0.32, 0.56, 0.78, 0.94];          // stage boundaries (progress)

export function initLLM(gl: GL) {
  const ch = register({ id: 'cL', rmP: 0.97 }); if (!ch) return null;
  const THREE = gl.THREE, R = gl.R, st = ch.stage, D = A.copy;
  const copy = $('.copy', st)!, endCopy = $('.lend', st)!, chipsEl = $('.chips', st)!, panel = $('.steps-wrap', st)!, pCard = $('.pcard', st)!;
  const head = headline(copy), endHead = headline(endCopy);
  void _c;
  const sentence: string = D.sentence, toks = tokenize(sentence);
  if (toks.length !== 5) console.warn('[v3] expected 5 tokens, got', toks.length);
  const NQ = toks.length, NT = NQ + 1;                 // + the sampled next token
  const chipEls = $$('.tk', chipsEl).slice(0, NT), sentEl = $('.sent', st) as HTMLElement;
  const cands = D.candidatos as Array<{ name: string; logit: number }>;
  const candRows = $$('.crow', pCard);
  const dial = $('.dial', pCard) as HTMLElement | null, dialV = $('.dialv', pCard);
  const steps = $$('li', panel);
  const rnd = rng(23);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };

  // causal attention weights (row i looks only at j < i)
  const ATT: number[][] = Array.from({ length: NT }, (_, i) => Array.from({ length: NT }, (_, j) => (j >= i ? 0 : Math.exp(-(i - j) * 0.45) * (0.35 + rnd()))));
  const boost = (i: number, j: number, v: number) => { if (ATT[i] && j < i) ATT[i][j] += v; };
  boost(1, 0, 1.6); boost(4, 3, 2.2); boost(5, 0, 1.4); boost(5, 3, 1.2); boost(5, 4, 0.8); boost(3, 2, 0.8);
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
  let trkW = 0; let lastW = 0, lastH = 0, gut = 24, hdrB = 64, stepsTop = 700, cardW = 262;
  const widths = chipEls.map(() => 80);
  function measure() {
    const sr = st.getBoundingClientRect(), r = panel.getBoundingClientRect();
    hdrB = ($('#hdr') as HTMLElement | null)?.getBoundingClientRect().bottom || 64; gut = A.mobile ? 14 : Math.max(24, A.W * 0.04);
    stepsTop = (r.top - sr.top) || A.H * 0.8; cardW = pCard.offsetWidth || 262; trkW = ($('.trk', pCard) as HTMLElement | null)?.clientWidth || 100;
    chipEls.forEach((c, i) => { widths[i] = (c.offsetWidth || 90); });
  }
  const S = () => 2 * 12 * Math.tan(20 * Math.PI / 180) / A.H;     // world units per px at z = 0
  const rowPos: Array<{ x: number; y: number }> = chipEls.map(() => ({ x: 0, y: 0 }));
  function rowLayout(p: number, count: number) {
    const mob = A.mobile, tp = eo(seg(p, 0.1, 0.17)), gap = lerp(mob ? 3 : 6, mob ? 6 : 16, tp);
    const left = gut, right = A.W - gut - (mob ? 0 : cardW + 28), maxW = right - left;
    const items = [] as number[]; for (let i = 0; i < count; i++) items.push(widths[i] + (mob ? 12 : 24) * tp);
    const lines: number[][] = [[]]; let wf = 0;
    items.forEach((w, i) => { const L = lines[lines.length - 1]; if (L.length && wf + gap + w > maxW) { lines.push([i]); wf = w; } else { L.push(i); wf += (L.length > 1 ? gap : 0) + w; } });
    const cx = (left + right) / 2, baseY = A.H * (mob ? 0.5 : 0.64), LH = mob ? 62 : 74;
    lines.forEach((L, li) => { const tw = L.reduce((a, i, k) => a + items[i] + (k ? gap : 0), 0); let x = cx - tw / 2;
      L.forEach((i, k) => { if (k) x += gap; rowPos[i].x = x + items[i] / 2; rowPos[i].y = baseY + (li - (lines.length - 1) / 2) * LH; x += items[i]; }); });
    return { tp, lines: lines.length };
  }
  const anc = chipEls.map(() => V3());
  const _p = V3(), tmp = { x: 0, y: 0, z: 0, d: 0 };
  const proj = (w: ThreeNS.Vector3) => { _p.copy(w).project(cam); tmp.x = (_p.x + 1) / 2 * A.W; tmp.y = (1 - _p.y) / 2 * A.H; tmp.z = _p.z; tmp.d = cam.position.distanceTo(w); return tmp; };

  // sampled next token at temperature T (fixed uniform draw so it is repeatable)
  const U0 = 0.62;
  const sample = (T: number) => { const pr = softmax(cands, T); let c = 0; for (let i = 0; i < pr.length; i++) { c += pr[i]; if (U0 <= c) return i; } return 0; };

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
  const _q = V3();

  ch.resize = () => { lastW = 0; };
  ch.frame = (p, dt, t) => {
    theme();
    if (lastW !== A.W || lastH !== A.H) { lastW = A.W; lastH = A.H; measure(); }
    uTime.value = t;
    const mob = A.mobile, s = S(), paper = A.paper();
    // ----- copy + panels
    head.set(seg(p, 0, 0.07), seg(p, 0.1, 0.15));
    endHead.set(seg(p, 0.945, 0.99));
    panel.style.opacity = (seg(p, 0.08, 0.13) * (1 - seg(p, 0.93, 0.96))).toFixed(3);
    steps.forEach((li, i) => { const a = SP[i], b = SP[i + 1], on = p >= a && p < b, done = p >= b; li.classList.toggle('on', on); li.classList.toggle('done', done); const u = $('u i', li) as HTMLElement; u.style.transform = `scaleX(${seg(p, a, b).toFixed(3)})`; });
    // ----- row of chips
    const L = rowLayout(p, NT);
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
      const cx = (rowPos[0].x + rowPos[NQ - 1].x) / 2, cy = rowPos[0].y, so = eo(seg(p, 0.025, 0.07)) * (1 - eo(seg(p, 0.1, 0.14)));
      sentEl.style.opacity = so.toFixed(3); sentEl.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) translate(-50%,-50%)`; }
    for (let i = 0; i < NT; i++) anc[i].set((rowPos[i].x - A.W / 2) * s, (A.H / 2 - rowPos[i].y) * s, 0);
    const vis = (i: number) => i < NQ ? eo(seg(p, 0.1, 0.14)) : i === NQ ? eio(seg(p, 0.5, 0.54)) : 0;
    const lift = (mob ? 21 : 26) * s;
    // ----- cloud + near lines (stage 1)
    const cA = 0.16 + 0.85 * eC + 0.1 * seg(p, 0.0, 0.06) * (1 - seg(p, 0.14, 0.2)); cloudMat.opacity = 1; (cloud.material as any).opacity = 1;
    for (let i = 0; i < VN; i++) cloudA[i] = (0.25 + 0.75 * ((i * 7919) % 100) / 100) * cA * (paper ? 1.1 : 1);
    (cg.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    nearL.visible = eC > 0.01; (nearL.material as ThreeNS.LineBasicMaterial).opacity = 0.3 * eC;
    if (nearL.visible) { let q = 0; for (let i = 0; i < NQ; i++) nearest(anc[i]).forEach(k => { nearPos.setXYZ(q++, anc[i].x, anc[i].y, anc[i].z); nearPos.setXYZ(q++, cloudP[k * 3], cloudP[k * 3 + 1], cloudP[k * 3 + 2]); }); nearPos.needsUpdate = true; }
    // ----- vectors (stage 1)
    const vP = seg(p, 0.2, 0.26) , vo = vP * (1 - eio(seg(p, 0.28, 0.31)));
    vecs.visible = vo > 0.01;
    if (vecs.visible) for (let i = 0; i < NQ; i++) for (let c = 0; c < VC; c++) { const k = i * VC + c, show = seg(vP, c / VC * 0.6, c / VC * 0.6 + 0.3);
      vcP[k * 3] = anc[i].x; vcP[k * 3 + 1] = anc[i].y + lift + 0.12 + c * 0.155; vcP[k * 3 + 2] = 0; vcA[k] = show * (1 - eio(seg(p, 0.28, 0.31))) * vis(i); }
    (vg.attributes.position as ThreeNS.BufferAttribute).needsUpdate = true; (vg.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    // ----- layers (stage 2): they rise over the row, a compute wave crosses them
    const y0 = (rowPos[0].y > 0 ? (A.H / 2 - (Math.min(...rowPos.slice(0, NQ).map(r => r.y)))) * s : 0) + lift + 0.55, ys = mob ? 0.34 : 0.46;
    const x0 = Math.min(...anc.slice(0, NQ).map(a => a.x)) - 0.45, x1 = Math.max(...anc.slice(0, NQ).map(a => a.x)) + 0.45;
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
    const topY = y0 + (NL - 1) * ys, nodeY = topY + 0.5;
    const predOn = seg(p, 0.42, 0.46) * (1 - seg(p, 0.55, 0.59)) + seg(p, SP[3], SP[3] + 0.03) * (1 - seg(p, 0.93, 0.96)) * 0.0;
    const nodeX = anc[NQ - 1].x;
    node.visible = beam.visible = predOn > 0.01; node.position.set(nodeX, nodeY, 0); node.quaternion.copy(cam.quaternion);
    const flash = seg(p, 0.5, 0.52);
    (nodeCore.material as ThreeNS.SpriteMaterial).opacity = predOn * (0.4 + 0.5 * (p > 0.5 ? 1 : 0)); nodeCore.scale.setScalar(0.34 + 0.14 * (p > 0.5 ? 1 - flash : 0));
    (nodeRing.material as ThreeNS.MeshBasicMaterial).opacity = predOn * 0.85; (nodePulse.material as ThreeNS.MeshBasicMaterial).opacity = predOn * (flash > 0 && flash < 1 ? (1 - flash) * 0.9 : 0); nodePulse.scale.setScalar(1 + 2.4 * eo(flash));
    const bp = beam.geometry.attributes.position as ThreeNS.BufferAttribute; bp.setXYZ(0, nodeX, topY, 0); bp.setXYZ(1, nodeX, nodeY - 0.19, 0); bp.needsUpdate = true; (beam.material as ThreeNS.LineBasicMaterial).opacity = predOn * 0.5;
    // ----- attention (stage 3): focus sweeps tokens 1..5; arcs look back only
    const env = seg(p, SP[2], 0.6) * (1 - seg(p, 0.76, 0.8)), aP = seg(p, 0.6, 0.72);
    const foc = p > 0.6 && p < 0.73 ? Math.min(NT - 1, 1 + Math.floor(aP * (NT - 1))) : -1;
    const allDim = seg(p, 0.58, 0.62) * (1 - seg(p, 0.72, 0.78)) * 0.08 + 0.02;
    const old = seg(p, 0.72, 0.78);              // the oldest tokens fall off the table
    arcs.forEach(a => {
      const v = Math.min(vis(a.i), vis(a.j)), w = ATT[a.i][a.j];
      const oldGone = (a.j < 2 ? 1 - 0.85 * old : 1);
      const o = env * v * oldGone * ((a.i === foc ? w * 3.2 : 0) + allDim * (0.3 + w));
      a.line.visible = o > 0.004; if (!a.line.visible) return;
      (a.line.material as ThreeNS.LineBasicMaterial).opacity = Math.min(1, o);
      const h = 0.26 + 0.2 * Math.min(8, a.i - a.j);
      for (let k = 0; k <= AS; k++) { bez(V3(anc[a.i].x, anc[a.i].y + lift, 0), V3(anc[a.j].x, anc[a.j].y + lift, 0), h, k / AS, _q); a.pos.setXYZ(k, _q.x, _q.y, _q.z); }
      a.pos.needsUpdate = true;
    });
    pulses.visible = env > 0.02;
    if (pulses.visible) arcs.forEach((a, k) => { const w = ATT[a.i][a.j], on = a.i === foc ? 1 : 0, h = 0.26 + 0.2 * Math.min(8, a.i - a.j), tt = 1 - ((t * 0.55 + (k * 0.37) % 1) % 1);
      bez(V3(anc[a.i].x, anc[a.i].y + lift, 0), V3(anc[a.j].x, anc[a.j].y + lift, 0), h, tt, _q); pulseP.set([_q.x, _q.y, _q.z], k * 3); pulseA[k] = env * on * Math.min(vis(a.i), vis(a.j)) * Math.min(1, w * 3) * 0.9; });
    (pulseGeo.attributes.position as ThreeNS.BufferAttribute).needsUpdate = true; (pulseGeo.attributes.aA as ThreeNS.BufferAttribute).needsUpdate = true;
    // ----- DOM chips over their 3D anchors
    chipEls.forEach((c, i) => {
      let o = vis(i); if (i < NQ && p < 0.02 + i * 0.008) o = 0;
      proj(anc[i]); if (tmp.z > 1) o = 0;
      const key = foc >= 0 && ATT[foc][i] > 0.2 && i < foc, isF = i === foc;
      const dim = i < 2 ? old : 0;
      c.style.setProperty('--pad', ((mob ? 6 : 9) * L.tp).toFixed(1) + 'px');
      c.style.transform = `translate3d(${tmp.x.toFixed(1)}px,${tmp.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${clamp(12 / Math.max(1, tmp.d), 0.7, 1.12).toFixed(3)})`;
      c.style.opacity = (o * (1 - 0.78 * dim)).toFixed(3); c.style.visibility = o > 0.005 ? 'visible' : 'hidden';
      c.classList.toggle('on', L.tp > 0.5); c.classList.toggle('f', isF); c.classList.toggle('h', !!key); c.classList.toggle('nw', i === NQ && p > 0.5 && p < 0.58);
      if (i === NQ && winShown !== win) { winShown = win; const b = $('b', c)!; b.textContent = cands[win].name; }
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
    if (A.log) { const lg = [D.logVec, D.logLay, D.logAtt, D.logNext, D.logLoop]; const idx = p > 0.82 ? 5 : p > 0.62 ? 3 : p > 0.44 ? 2 : p > 0.2 ? 1 : 0; if (p > 0.12) A.log.set('cL', [toks.join(' · '), ...(p > 0.2 ? [D.logVec] : []), ...(p > 0.34 ? [D.logLay] : []), ...(p > 0.46 ? [D.logNext] : []), ...(p > 0.6 ? [D.logAtt] : []), ...(p > 0.78 ? [D.tabTemp] : [])].slice(-3), 3); void lg; void idx; }
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
