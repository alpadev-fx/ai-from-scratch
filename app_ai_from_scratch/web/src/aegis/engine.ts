// One fixed WebGL2 canvas behind every chapter. It composites the active
// chapter's layer (a footage plate or a 3D scene render), cross-dissolves at
// chapter boundaries, then runs the finishing chain: halo, anamorphic streak,
// chromatic aberration + directional blur driven by scroll velocity, grain and
// vignette. The chain has two modes. Dark: light adds (bloom). Paper: the same
// maths run on DARKNESS and multiply, so the halo is a soft dark bleed and
// nothing is ever white on white.
//
// three is dynamic-imported by main.ts after first paint; this module only
// receives the namespace, so nothing here touches window at import time.
import type * as ThreeNS from 'three';
import { A } from './state';
import { ahead, type Seq } from './seq';
import { createRatchet, WHAT, type Step } from './quality';
import { clamp, seg } from './util';

type T = typeof ThreeNS;
export interface Post { bloom: number; streak: number; ca: number; grain: number; vign: number; thr: number; mb: number }
export interface Layer {
  kind: 'foot' | 'scene';
  seq?: Seq; f?: number;                // fractional frame index
  plate?: [number, number, number, number]; // css px: x, y, w, h
  focus?: number; exp?: number; glitch?: number; fill?: number;
  scene?: (target: ThreeNS.WebGLRenderTarget) => void;
  post?: Partial<Post>;
  at?: number;
}
export interface GL {
  R: ThreeNS.WebGLRenderer; THREE: T; PR: number; LOW: boolean;
  set(id: string, l: Layer): void; render(dt: number): void; resize(): void;
  newRT(w: number, h: number, samples?: number): ThreeNS.WebGLRenderTarget; size(): [number, number];
  bg(): [number, number, number];
}

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5;} return s; }`;

export function createEngine(THREE: T, cv: HTMLCanvasElement): GL | null {
  let R: ThreeNS.WebGLRenderer;
  try { R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }); }
  catch { return null; }
  if (!R.capabilities.isWebGL2) return null;
  THREE.ColorManagement.enabled = false;
  R.autoClear = false; R.setPixelRatio(1);
  let PR = Math.min(A.dpr, 1.5);                                    // the ratchet (quality.ts) can only lower it
  const LOW = A.mobile, ratchet = createRatchet(PR), Q = { blur: true, ca: true, bloom: true };
  const rt: Record<string, ThreeNS.WebGLRenderTarget> = {};
  let W = 2, H = 2;
  const RT = (w: number, h: number, o: Partial<ThreeNS.RenderTargetOptions> = {}) =>
    new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, ...o });
  function size() {
    W = Math.max(2, Math.round(innerWidth * PR)); H = Math.max(2, Math.round(innerHeight * PR));
    R.setSize(W, H, false);
    const q = (s: number): [number, number] => [Math.max(2, Math.round(W / s)), Math.max(2, Math.round(H / s))];
    const set = (k: string, d: [number, number], o?: Partial<ThreeNS.RenderTargetOptions>) => { if (rt[k]) rt[k].setSize(d[0], d[1]); else rt[k] = RT(d[0], d[1], o); };
    set('sceneA', [W, H], { depthBuffer: true, samples: LOW ? 2 : 4 }); set('sceneB', [W, H], { depthBuffer: true, samples: LOW ? 2 : 4 });
    set('base', [W, H]); set('bright', q(2)); set('b4a', q(4)); set('b4b', q(4)); set('b8a', q(8)); set('b8b', q(8)); set('s8a', q(8)); set('s8b', q(8));
  }

  const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; qScene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (fs: string, uniforms: Record<string, { value: unknown }>) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const pass = (mat: ThreeNS.ShaderMaterial, target: ThreeNS.WebGLRenderTarget | null) => { quad.material = mat; R.setRenderTarget(target); R.render(qScene, qCam); };
  const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y), V4 = (x = 0, y = 0, z = 0, w = 0) => new THREE.Vector4(x, y, z, w), V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK.needsUpdate = true;

  const HEAD = 'precision highp float; varying vec2 vUv;';

  // ---- compositor: layer A / layer B + transition ------------------------------------------------
  const BASE_FS = HEAD + `
    uniform sampler2D tA0, tA1, tB0, tB1, tSA, tSB;
    uniform vec4 pA, pB;           // plate rects in px (x,y,w,h)
    uniform vec4 fA, fB;           // x: frame mix, y: focus, z: exposure, w: fill
    uniform vec4 kA, kB;           // x: kind (0 none, 1 foot, 2 scene), y: glitch
    uniform vec3 bg; uniform vec2 res; uniform float tr, time, paper, trT;
    ${NOISE}
    vec3 grade(vec3 c){
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      if (paper > 0.5) return vec3(pow(l, 1.08) * 0.9 + 0.01);       // print plate: pulled slightly under the paper white
      return vec3(pow(l, 1.12) * 0.94);
    }
    vec3 foot(sampler2D t0, sampler2D t1, vec4 plate, vec4 f, vec4 k, vec2 px){
      vec2 uv = (px - plate.xy) / plate.zw;
      float lod = (1.0 - clamp(f.y, 0.0, 1.0)) * 3.6;
      // surround: the same frame blown up and blurred, kept dim (dark) or faint (paper)
      vec2 cuv = (px - (plate.xy + plate.zw * 0.5)) / (plate.zw * 2.4) + 0.5;
      vec3 sur = grade(mix(textureLod(t0, cuv, 5.0).rgb, textureLod(t1, cuv, 5.0).rgb, f.x));
      vec3 outc = mix(bg, paper > 0.5 ? mix(bg, sur, 0.42) : sur * 0.34, f.w);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return outc;
      if (k.y > 0.001){
        float band = floor(uv.y * 38.0), tt = floor(time * 16.0), on = step(0.6, h21(vec2(band, tt)));
        uv.x += (h21(vec2(band * 1.7 + 3.0, tt)) - 0.5) * 0.08 * k.y * on;
      }
      vec3 a = mix(textureLod(t0, uv, lod).rgb, textureLod(t1, uv, lod).rgb, f.x);
      if (k.y > 0.001) a.r = mix(textureLod(t0, uv + vec2(0.006 * k.y, 0.0), lod).r, textureLod(t1, uv + vec2(0.006 * k.y, 0.0), lod).r, f.x);
      return grade(a) * f.z;
    }
    vec3 layer(sampler2D t0, sampler2D t1, sampler2D ts, vec4 plate, vec4 f, vec4 k, vec2 px){
      if (k.x < 0.5) return bg;
      if (k.x > 1.5) return texture(ts, vUv).rgb;
      return foot(t0, t1, plate, f, k, px);
    }
    void main(){
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * res;
      vec3 a = layer(tA0, tA1, tSA, pA, fA, kA, px);
      if (trT < 0.5){ gl_FragColor = vec4(a, 1.0); return; }
      vec3 b = layer(tB0, tB1, tSB, pB, fB, kB, px);
      float t = clamp(tr, 0.0, 1.0), asp = res.x / res.y;
      vec3 col;
      if (trT < 1.5) col = mix(a, b, smoothstep(0.0, 1.0, t));
      else {      // data dissolve: noise front eats A, leaving an edge line of ink (paper) or light (dark)
        float n = fbm(px / res * vec2(asp, 1.0) * 4.0 + 7.3) * 0.8 + h21(floor(px / 4.0)) * 0.2;
        float e = t * 1.3 - 0.15, keep = smoothstep(e - 0.03, e + 0.03, n);
        float edge = exp(-abs(n - e) * 55.0) * (1.0 - step(0.999, t)) * step(0.001, t);
        col = mix(b, a, keep);
        col += (paper > 0.5 ? vec3(-0.85) : vec3(0.9, 0.95, 1.0)) * edge * 1.4;
      }
      gl_FragColor = vec4(col, 1.0);
    }`;
  const MB = mk(BASE_FS, {
    tA0: { value: BLACK }, tA1: { value: BLACK }, tB0: { value: BLACK }, tB1: { value: BLACK }, tSA: { value: BLACK }, tSB: { value: BLACK },
    pA: { value: V4() }, pB: { value: V4() }, fA: { value: V4() }, fB: { value: V4() }, kA: { value: V4() }, kB: { value: V4() },
    bg: { value: V3() }, res: { value: V2(1, 1) }, tr: { value: 0 }, time: { value: 0 }, paper: { value: 0 }, trT: { value: 0 },
  });

  // ---- bright pass (darkness pass in paper) + blur --------------------------------------------------
  const MBright = mk(HEAD + `uniform sampler2D tIn; uniform vec2 px; uniform float thr, paper; uniform vec3 bg;
    void main(){ vec3 c = (texture(tIn, vUv + px*vec2(-1,-1)).rgb + texture(tIn, vUv + px*vec2(1,-1)).rgb + texture(tIn, vUv + px*vec2(-1,1)).rgb + texture(tIn, vUv + px*vec2(1,1)).rgb) * 0.25;
      float l = dot(c, vec3(0.299,0.587,0.114));
      float m = paper > 0.5 ? max(0.0, dot(bg, vec3(0.299,0.587,0.114)) - l) * 1.25 : l;
      gl_FragColor = vec4(vec3(m * smoothstep(thr, thr + 0.3, m)), 1.0); }`,
    { tIn: { value: null }, px: { value: V2() }, thr: { value: 0.62 }, paper: { value: 0 }, bg: { value: V3() } });
  const MBlur = mk(HEAD + `uniform sampler2D tIn; uniform vec2 dir;
    void main(){ vec3 c = texture(tIn, vUv).rgb * 0.2270;
      c += (texture(tIn, vUv + dir*1.3846).rgb + texture(tIn, vUv - dir*1.3846).rgb) * 0.3162;
      c += (texture(tIn, vUv + dir*3.2308).rgb + texture(tIn, vUv - dir*3.2308).rgb) * 0.0703;
      gl_FragColor = vec4(c, 1.0); }`, { tIn: { value: null }, dir: { value: V2() } });

  // ---- finishing ---------------------------------------------------------------------------------
  const MF = mk(HEAD + `uniform sampler2D tBase, tB4, tB8, tSt; uniform vec2 res; uniform vec3 bg;
    uniform float ca, mb, grain, vign, bloom, streak, paper, fade;
    ${NOISE}
    vec3 samp(vec2 u){ if (ca < 0.00002) return texture(tBase, u).rgb; vec2 o = (u - 0.5) * ca; return vec3(texture(tBase, u + o).r, texture(tBase, u).g, texture(tBase, u - o).b); }
    void main(){
      vec2 u = vUv; float asp = res.x / res.y;
      vec3 c;
      if (mb > 0.0004){ c = vec3(0.0); for (int i = 0; i < 7; i++) c += samp(u + vec2(0.0, (float(i)/6.0 - 0.5) * mb)); c /= 7.0; } else c = samp(u);
      float h = (bloom + streak) < 0.0005 ? 0.0 : (texture(tB4, u).r * 0.55 + texture(tB8, u).r * 0.85) * bloom + texture(tSt, u).r * streak;
      if (paper > 0.5) c *= 1.0 - clamp(h * 0.55, 0.0, 0.6);     // dark halo: ink bleeds into the paper
      else c += vec3(h);
      float v = length((vUv - 0.5) * vec2(asp, 1.0) * 0.92);
      float vg = vign * smoothstep(0.42, 1.02, v);
      c = paper > 0.5 ? mix(c, c * 0.82, vg) : c * (1.0 - vg);
      float g = (h21(vUv * res * 1.31) - 0.5) * grain * (paper > 0.5 ? 0.55 : 1.0);   // the same grain on every frame: grain that is re-drawn each frame shimmers on a still picture
      c += g;
      gl_FragColor = vec4(c * fade, 1.0);
    }`, {
    tBase: { value: null }, tB4: { value: null }, tB8: { value: null }, tSt: { value: null }, res: { value: V2(1, 1) }, bg: { value: V3() },
    ca: { value: 0.0015 }, mb: { value: 0 }, grain: { value: 0.05 }, vign: { value: 0.38 }, bloom: { value: 0.8 }, streak: { value: 0.35 }, paper: { value: 0 }, fade: { value: 1 },
  });

  // ---- footage textures: small LRU pool per sequence, <= 2 uploads per frame ---------------------
  const CAP = LOW ? 8 : 6; let clock = 0, uploads = 0;
  const pools = new Map<Seq, Map<number, { tex: ThreeNS.Texture; at: number }>>();
  const poolOf = (s: Seq) => { let p = pools.get(s); if (!p) { p = new Map(); pools.set(s, p); } return p; };
  const newTex = () => { const t = new THREE.Texture(); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; return t; };
  function texFor(seq: Seq, i: number) {
    const pool = poolOf(seq), e = pool.get(i);
    if (e) { e.at = clock; return e.tex; }
    if (uploads >= 2 || !seq.has(i)) { seq.decode(i); return null; }
    const bmp = seq.take(i)!; uploads++;
    let tex: ThreeNS.Texture;
    if (pool.size >= CAP) { let old: { tex: ThreeNS.Texture; at: number } | null = null, ok = -1; pool.forEach((v, k) => { if (!old || v.at < old.at) { old = v; ok = k; } }); pool.delete(ok); tex = old!.tex; }
    else tex = newTex();
    tex.image = bmp; tex.needsUpdate = true; pool.set(i, { tex, at: clock });
    return tex;
  }
  function nearestTex(seq: Seq, i: number) { let best: { tex: ThreeNS.Texture; at: number } | null = null, bd = 1e9; poolOf(seq).forEach((v, k) => { const d = Math.abs(k - i); if (d < bd) { bd = d; best = v; } }); if (best) (best as any).at = clock; return best ? (best as any).tex as ThreeNS.Texture : null; }
  // the direction the playhead is travelling in, per sequence: the sign of the last real move of the frame index (a hair of noise, 0.02 of a frame, keeps the last direction)
  const way = new WeakMap<Seq, { f: number; dir: number }>();
  let drawn = 0, missed = 0;                                       // frames drawn from footage, and how many of them had to show a stand-in for a frame that was not ready (__v3Q)
  function frames(seq: Seq, f: number): [ThreeNS.Texture, ThreeNS.Texture, number] {
    const n = seq.n, i0 = clamp(Math.floor(f), 0, n - 1), i1 = Math.min(n - 1, i0 + 1);
    let fm = clamp(f - i0);
    let w = way.get(seq); if (!w) { w = { f, dir: 1 }; way.set(seq, w); }
    if (f - w.f > 0.02) { w.dir = 1; w.f = f; } else if (f - w.f < -0.02) { w.dir = -1; w.f = f; }
    seq.setFocus(f, w.dir);
    const pool = poolOf(seq);
    ahead(i0, w.dir, n).forEach(j => { if (!pool.has(j)) seq.decode(j); });
    let t0 = texFor(seq, i0), t1 = texFor(seq, i1);
    drawn++; if (!t0 || !t1) missed++;
    if (!t0) { t0 = nearestTex(seq, i0); fm = 0; }
    if (!t1) { t1 = t0; fm = 0; }
    return [t0 || BLACK, t1 || BLACK, fm];
  }

  // ---- layer binding -----------------------------------------------------------------------------
  const st: Record<string, Layer> = {};
  const fresh = (id: string) => { const s = st[id]; return s && s.at === A.st.t ? s : null; };
  function bind(X: 'A' | 'B', l: Layer | null) {
    const u = MB.uniforms, k = u['k' + X].value as ThreeNS.Vector4, f = u['f' + X].value as ThreeNS.Vector4, p = u['p' + X].value as ThreeNS.Vector4;
    if (!l) { k.set(0, 0, 0, 0); return; }
    if (l.kind === 'scene') { k.set(2, 0, 0, 0); return; }
    let fm = 0;
    if (l.seq && l.f != null) { const fr = frames(l.seq, l.f); u['t' + X + '0'].value = fr[0]; u['t' + X + '1'].value = fr[1]; fm = fr[2]; }
    else { u['t' + X + '0'].value = BLACK; u['t' + X + '1'].value = BLACK; l.seq && l.seq.warm(); }
    k.set(1, l.glitch || 0, 0, 0);
    f.set(fm, l.focus == null ? 1 : l.focus, l.exp == null ? 1 : l.exp, l.fill == null ? 1 : l.fill);
    const pl = l.plate || [0, 0, innerWidth, innerHeight]; p.set(pl[0], pl[1], pl[2], pl[3]);
  }

  const TRANS: Record<string, number> = { 'c01>cL': 2 };
  const DEF: Post = { bloom: 0.75, streak: 0.3, ca: 0.0012, grain: 0.05, vign: 0.36, thr: 0.62, mb: 1 };
  let shown = false, vS = 0;
  const show = (on: boolean) => { if (on !== shown) { shown = on; cv.style.visibility = on ? 'visible' : 'hidden'; } };
  const bgc = (): [number, number, number] => (A.paper() ? [0xF2 / 255, 0xF2 / 255, 0xF2 / 255] : [0, 0, 0]);

  // ---- quality ratchet (quality.ts): down only, one step at a time, each one said once ---------------------
  let lastDraw = 0;
  function feed() {
    const t = performance.now(), ms = lastDraw ? t - lastDraw : 0; lastDraw = t;   // time since the previous DRAWN frame: frames the canvas sat out (hidden, another chapter) are not slow frames
    if (!ms) return;
    const step = ratchet.frame(ms); if (!step) return;
    if (step === 'pr125') PR = 1.25; else if (step === 'pr100') PR = 1; else Q[step] = false;
    if (step === 'pr125' || step === 'pr100') size();
    document.documentElement.dataset.q = String(ratchet.taken.length);
    console.info(`[v3] quality ${ratchet.taken.length}/${ratchet.size}: ${WHAT[step]} (this device is not holding the frame rate; it will not go back up this visit)`);
  }
  // review hook, read only: the ratchet's state and how often the footage had to show a stand-in frame (scripts/v3-fps.mjs reads it)
  (globalThis as any).__v3Q = () => ({ q: ratchet.taken.length, steps: [...ratchet.taken], of: ratchet.size, pr: PR, drawn, missed });

  function render(dt: number) {
    clock++; uploads = 0;
    const sh = A.shot, t = sh ? clamp(sh.t || 0) : 0;
    let la = sh && sh.a ? fresh(sh.a.id) : null, lb = sh && sh.b ? fresh(sh.b.id) : null;
    let type = la && lb && sh && sh.b ? (TRANS[sh.a.id + '>' + sh.b.id] || 1) : 0;
    if (!la && lb) { la = lb; lb = null; type = 0; }
    if (!la) { show(false); lastDraw = 0; return; }
    show(true);
    feed();
    const u = MB.uniforms, now = A.st.t, paper = A.paper() ? 1 : 0, [r, g, b] = bgc();
    (u.bg.value as ThreeNS.Vector3).set(r, g, b); u.paper.value = paper;
    R.setClearColor(new THREE.Color(r, g, b), 1);
    bind('A', la); bind('B', lb);
    u.tSA.value = u.tSB.value = BLACK;
    if (la.kind === 'scene' && la.scene) { la.scene(rt.sceneA); u.tSA.value = rt.sceneA.texture; }
    if (lb && lb.kind === 'scene' && lb.scene) { lb.scene(rt.sceneB); u.tSB.value = rt.sceneB.texture; }
    u.tr.value = t; u.trT.value = type; u.time.value = now;
    pass(MB, rt.base);
    // post parameters: the active chapter's, blended into the next one's across a boundary
    const pa = { ...DEF, ...(la.post || {}) }, pb = lb ? { ...DEF, ...(lb.post || {}) } : pa;
    const P = {} as Post; (Object.keys(DEF) as (keyof Post)[]).forEach(k => { P[k] = pa[k] + (pb[k] - pa[k]) * (type ? clamp((t - 0.3) / 0.4) : 0); });
    if (Q.bloom) {                                                // the halo: the bright pass and six blurs (the last step of the ratchet gives it up)
      MBright.uniforms.tIn.value = rt.base.texture; (MBright.uniforms.px.value as ThreeNS.Vector2).set(0.5 / rt.bright.width, 0.5 / rt.bright.height);
      MBright.uniforms.thr.value = P.thr; MBright.uniforms.paper.value = paper; (MBright.uniforms.bg.value as ThreeNS.Vector3).set(r, g, b);
      pass(MBright, rt.bright);
      const blur = (src: ThreeNS.WebGLRenderTarget, dst: ThreeNS.WebGLRenderTarget, dx: number, dy: number) => { MBlur.uniforms.tIn.value = src.texture; (MBlur.uniforms.dir.value as ThreeNS.Vector2).set(dx / src.width, dy / src.height); pass(MBlur, dst); };
      blur(rt.bright, rt.b4a, 1, 0); blur(rt.b4a, rt.b4b, 0, 1); blur(rt.b4b, rt.b8a, 1.5, 0); blur(rt.b8a, rt.b8b, 0, 1.5);
      blur(rt.b8b, rt.s8a, 5, 0); blur(rt.s8a, rt.s8b, 14, 0);
    }
    const f = MF.uniforms;
    vS += (Math.abs(A.st.v) - vS) * Math.min(1, dt * 8);
    const pulse = type === 2 ? Math.sin(Math.PI * t) : 0;
    f.tBase.value = rt.base.texture; f.tB4.value = rt.b4b.texture; f.tB8.value = rt.b8b.texture; f.tSt.value = rt.s8b.texture;
    f.paper.value = paper; (f.bg.value as ThreeNS.Vector3).set(r, g, b);
    f.mb.value = A.rm || !Q.blur ? 0 : Math.min(0.024, vS / 110000) * P.mb;
    f.ca.value = Q.ca ? P.ca + Math.min(0.006, vS / 700000) + pulse * 0.006 : 0;
    f.grain.value = P.grain; f.vign.value = P.vign; f.bloom.value = Q.bloom ? P.bloom : 0; f.streak.value = Q.bloom ? P.streak : 0;
    pass(MF, null);
  }
  function resize() { size(); (MB.uniforms.res.value as ThreeNS.Vector2).set(innerWidth, innerHeight); (MF.uniforms.res.value as ThreeNS.Vector2).set(innerWidth, innerHeight); }
  resize(); addEventListener('resize', resize);
  return { R, THREE, get PR() { return PR; }, LOW, set(id, l) { l.at = A.st.t; st[id] = l; }, render, resize, newRT: (w, h, s = 0) => RT(w, h, { depthBuffer: true, samples: s }), size: () => [W, H], bg: bgc };
}
export const _seg = seg;
