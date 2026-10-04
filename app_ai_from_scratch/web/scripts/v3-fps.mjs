#!/usr/bin/env node
// Frame pacing of /v3, chapter by chapter. The owner's rule is 60 fps everywhere: movement, footage, everything.
//
//   Budget (every chapter, at 1440x900 and at 390x844, CPU throttled x4): every 1-second window holds >= 58 frames and no frame takes longer than 50 ms. A window is attributed to the
//   chapter the reader is in when it ends, so the way INTO a chapter (its first second on screen, the dissolve from the one before) counts for that chapter.
//
//   node scripts/v3-fps.mjs [--base URL[,URL2]] [--vp d|m|both] [--theme dark|paper|both] [--cpu 4] [--only c02,c05] [--runs 1] [--json out.json] [--compare before.json]
//                           [--speeds 1100,320] [--up-speed 1100[,3000]] [--lead 1100] [--hold 3500] [--no-up] [--lang es|en] [--exe path] [--allow-software]
//   node scripts/v3-fps.mjs --nodes        how many nodes of each chapter the engine writes a style on in a whole pass (budget 80 per chapter)
//   node scripts/v3-fps.mjs --ratchet      the quality ratchet end to end: throttle hard, it steps down in order, each step said once; unthrottle, it does not come back up
//   (pnpm --dir web fps:v3 -- <the same options>; --base defaults to $BASE, then http://127.0.0.1:4321)
//   Two bases (--base http://127.0.0.1:4411,http://127.0.0.1:4410, --label before,after) are measured INTERLEAVED, run by run, and printed side by side: on a machine whose background load
//   moves (it does) that is the only comparison of two builds that is fair. Each needs the review hook window.__v3Q. The LAST base is the one judged (exit code); the others are baselines.
//
// How it measures (each of these is a mistake somebody has already made):
//   * The GPU is forced (ANGLE/Metal on a Mac, `--ignore-gpu-blocklist`): a software GL (SwiftShader) draws the engine at a few fps, and a number measured on it says nothing. The renderer
//     is read back and a software one is refused, not measured.
//   * The engine must be LIVE before a number is believed: html.foot-on (the hero's footage is in) and the review hook window.__v3Q. A page that fell back to the static layout would measure
//     60 fps of nothing.
//   * One continuous pass from the top of the page to its end, like a reader, at a fast and a slow speed, and one back up at the fast one; then a hold at the end so the effects that play
//     once have finished. A fresh page per run, so the quality ratchet's steps (which are down only, and which are said in the console) are part of what is measured, and the table says
//     how far down each chapter was.
//   * CPU throttling is switched on after the engine is up, not before: it models a slow phone's main thread, not a slow download.
//   * A check that cannot run counts as FAILED: a page that does not load, an engine that does not attach, a software renderer, a chapter that never appeared, exit 1.
// An avg of 16.7 ms is the 60 Hz vsync ceiling: it proves no frame was lost, not that the work fits in 8.3 ms (a 120 Hz screen).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const BUDGET = { fps: 58, frameMs: 50, nodes: 80 };
// A chapter that was already over the node budget when the budget was first measured is PINNED at what it is: said in the output every time, never raised without somebody reading this line, and
// the 80 stays for everything else. (The hero's headline is split into letters: 39 chars + 8 words + 3 lines + 3 masks, and its HUD: 84. Under 80 it would be a different reveal: the owner's call.)
const PINNED = { c01: 84 };
const PROFILES = {
  d: { name: '1440x900@2x', viewport: { width: 1440, height: 900 }, dsf: 2, phone: false, speeds: [1100, 320], up: 1100 },
  m: { name: '390x844@3x', viewport: { width: 390, height: 844 }, dsf: 3, phone: true, speeds: [900, 300], up: 900 },
};

// ---------- options ----------
const raw = process.argv.slice(2), opt = {};
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (!a.startsWith('--')) { console.error(`v3-fps: unexpected argument «${a}»`); process.exit(2); }
  const k = a.slice(2), flag = ['nodes', 'ratchet', 'no-up', 'allow-software', 'help'].includes(k);
  if (flag) opt[k] = true; else { opt[k] = raw[++i]; if (opt[k] === undefined) { console.error(`v3-fps: --${k} needs a value`); process.exit(2); } }
}
if (opt.help) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
const BASES = String(opt.base ?? process.env.BASE ?? 'http://127.0.0.1:4321').split(',').map((b) => b.trim().replace(/\/$/, '')).filter(Boolean);
const LABELS = opt.label ? String(opt.label).split(',').map((b) => b.trim()) : BASES;
if (!BASES.length || LABELS.length !== BASES.length) { console.error('v3-fps: --base and --label are lists of the same length'); process.exit(2); }
const CPU = Number(opt.cpu ?? (opt.ratchet ? 16 : 4)), LANG = opt.lang ?? 'es', RUNS = Number(opt.runs ?? 1), HOLD = Number(opt.hold ?? 3500), LEAD = Number(opt.lead ?? 1100);
const vpArg = opt.vp ?? 'both', themeArg = opt.theme ?? 'dark';
const VPS = vpArg === 'both' ? ['d', 'm'] : String(vpArg).split(','), THEMES = themeArg === 'both' ? ['dark', 'paper'] : String(themeArg).split(',');
const ONLY = opt.only ? String(opt.only).split(',') : null;
for (const v of VPS) if (!PROFILES[v]) { console.error(`v3-fps: --vp is d, m or both, not «${v}»`); process.exit(2); }
for (const t of THEMES) if (!['dark', 'paper'].includes(t)) { console.error(`v3-fps: --theme is dark, paper or both, not «${t}»`); process.exit(2); }
if (!(CPU >= 1) || !(RUNS >= 1)) { console.error('v3-fps: --cpu and --runs are numbers >= 1'); process.exit(2); }

const ANGLE = process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
const LAUNCH = process.env.V3_FPS_ARGS ? process.env.V3_FPS_ARGS.split(/\s+/).filter(Boolean) : [...ANGLE, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
let failed = 0;
const fail = (msg) => { failed++; console.error(`FAIL ${msg}`); };

// ---------- one page, engine up ----------
async function open(browser, prof, theme, BASE = BASES[0]) {
  const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.dsf, isMobile: prof.phone, hasTouch: prof.phone });
  await ctx.addCookies([{ name: 'pref_theme', value: theme, url: BASE }, { name: 'pref_lang', value: LANG, url: BASE }]);
  const page = await ctx.newPage(), logs = [], errors = [];
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[v3] quality')) logs.push(t); else if (['warning', 'error'].includes(m.type()) && !t.includes('willReadFrequently')) errors.push(`${m.type()}: ${t.slice(0, 200)}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => { try { sessionStorage.setItem('v3_ign', '1'); } catch { /* private mode */ } });
  const res = await page.goto(`${BASE}/v3`, { waitUntil: 'load' });
  if (!res || !res.ok()) throw new Error(`${BASE}/v3 answered ${res ? res.status() : 'nothing'}`);
  await page.waitForFunction(() => document.documentElement.classList.contains('foot-on'), null, { timeout: 60000 })
    .catch(() => { throw new Error('the engine did not come up (html.foot-on never appeared): nothing would be measured but the static page'); });
  await page.waitForTimeout(1500);
  const live = await page.evaluate(() => {
    const de = document.documentElement, c = document.createElement('canvas'), g = c.getContext('webgl2'), ext = g && g.getExtension('WEBGL_debug_renderer_info');
    return { gl: de.classList.contains('gl-on'), fxl: de.classList.contains('fxl'), hook: typeof globalThis.__v3Q === 'function', renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (g ? 'unknown' : 'none') };
  });
  if (!live.gl || !live.fxl) throw new Error(`the engine is not live (gl-on ${live.gl}, fxl ${live.fxl})`);
  if (!live.hook) throw new Error('window.__v3Q is missing: this build has no quality ratchet hook (run against a build of the 60 fps pass or later)');
  if (/swiftshader|llvmpipe|software|none/i.test(live.renderer) && !opt['allow-software']) throw new Error(`WebGL runs on «${live.renderer}»: a software renderer says nothing about frame pacing (--allow-software to measure it anyway)`);
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return { ctx, page, cdp, logs, errors, renderer: live.renderer };
}

/** The chapters' regions of the page, in document pixels, as they are with the engine's layout on. */
const regionsOf = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('main > section[id], section[id].sec, footer.endp')], seen = new Set(), out = [];
  for (const e of els) { const id = e.id || 'footer'; if (seen.has(id)) continue; seen.add(id); const r = e.getBoundingClientRect(); out.push({ id, top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }); }
  return out.sort((a, b) => a.top - b.top).map((r) => ({ ...r }));
});

/** Scroll from y0 to y1 at `speed` px/s, driven by rAF (a flick), hold `hold` ms at the end, and return every frame's timestamp, position and quality step. */
const drive = (page, o) => page.evaluate((p) => new Promise((resolve) => {
  const ts = [], ys = [], qs = [], de = document.documentElement, up = p.y1 < p.y0;
  let t0 = 0, held = 0;
  scrollTo(0, p.y0);
  const step = (t) => {
    if (!t0) t0 = t;
    const d = (Math.max(0, t - t0 - (p.lead || 0)) / 1000) * p.speed, y = up ? Math.max(p.y1, p.y0 - d) : Math.min(p.y1, p.y0 + d);   // the first `lead` ms stand still: windows exist from the first step
    ts.push(t); ys.push(y); qs.push(+(de.dataset.q || 0));
    scrollTo(0, y);
    if (up ? y > p.y1 : y < p.y1) { requestAnimationFrame(step); return; }
    if (!held) held = t;
    if (t - held < p.hold) { requestAnimationFrame(step); return; }
    resolve({ ts, ys, qs, q: globalThis.__v3Q() });
  };
  setTimeout(() => requestAnimationFrame(step), 700);
}), o);

/** Per chapter: the worst 1 s window ending in it (frames in it, and the chapter the slowest frame of that window belongs to), the worst frame (ms), frames over 33 and over 50 ms, the quality step at its end. */
function analyse(rec, regions, H) {
  const { ts, ys, qs } = rec, n = ts.length, per = new Map(regions.map((r) => [r.id, { frames: 0, min: Infinity, via: null, worst: 0, over33: 0, over50: 0, q: 0 }]));
  const last = regions[regions.length - 1], lastMid = last.top + (last.bottom - last.top) / 2;
  // the chapter the reader is in: the one under the middle of the viewport; at the end of the page, the last one as soon as half of it is on screen (a footer shorter than half a screen is never under the middle)
  const idOf = (y) => { if (y + H >= lastMid) return last.id; const c = y + H / 2; for (const r of regions) if (c >= r.top && c < r.bottom) return r.id; return c < regions[0].top ? regions[0].id : last.id; };
  const S = Math.min(8, n - 1), who = ys.map(idOf);                   // the first frames of a pass are the page settling after the jump
  for (let i = S + 1, j = S; i < n; i++) {
    const c = per.get(who[i]), dt = ts[i] - ts[i - 1];
    c.frames++; if (dt > c.worst) c.worst = dt; if (dt > 33.4) c.over33++; if (dt > BUDGET.frameMs) c.over50++; c.q = Math.max(c.q, qs[i]);
    if (ts[i] - ts[S] >= 1000) {
      while (ts[j] < ts[i] - 1000) j++;
      if (i - j < c.min) { c.min = i - j; let k = i, big = 0; for (let m = j + 1; m <= i; m++) if (ts[m] - ts[m - 1] > big) { big = ts[m] - ts[m - 1]; k = m; } c.via = who[k] === who[i] ? null : who[k]; }
    }
  }
  return per;
}
// a chapter that is short enough for no 1 s window to end in it is judged by its frames alone; one that never had a frame was never measured, and that fails
const ok = (c) => !!c && c.frames > 0 && (c.min === Infinity || c.min === null || c.min >= BUDGET.fps) && c.worst <= BUDGET.frameMs;
const cell = (c) => (!c || !c.frames ? '   n/a' : `${(c.min === Infinity || c.min === null ? '-' : String(c.min)).padStart(3)} / ${c.worst.toFixed(1).padStart(5)}${ok(c) ? (c.via ? '~' : ' ') : '!'}`);

// ---------- the fps table ----------
async function fpsRun(browser, base, vp, theme, runIdx) {
  const prof = PROFILES[vp], { ctx, page, logs, errors, renderer } = await open(browser, prof, theme, base);
  try {
    const regions = await regionsOf(page), H = prof.viewport.height, docH = await page.evaluate(() => document.documentElement.scrollHeight), end = docH - H;
    const want = ONLY ? regions.filter((r) => ONLY.includes(r.id)) : regions;
    if (ONLY) for (const id of ONLY) if (!regions.some((r) => r.id === id)) throw new Error(`chapter «${id}» is not on the page (${regions.map((r) => r.id)})`);
    if (!want.length) throw new Error('no chapter to measure');
    const y0 = ONLY ? Math.max(0, want[0].top - 3 * H) : 0, y1 = ONLY ? Math.min(end, want[want.length - 1].bottom - H / 2) : end;
    const passes = [];
    for (const sp of (opt.speeds ? String(opt.speeds).split(',').map(Number) : prof.speeds)) passes.push({ key: `dn${sp}`, y0, y1, speed: sp });
    if (!opt['no-up']) for (const up of String(opt['up-speed'] ?? prof.up).split(',').map(Number)) passes.push({ key: `up${up}`, y0: y1, y1: y0, speed: up });
    const out = { regions: want.map((r) => r.id), passes: {}, q: {}, foot: {}, logs: [], errors: [], renderer };
    for (const ps of passes) {
      const before = await page.evaluate(() => globalThis.__v3Q()), rec = await drive(page, { ...ps, hold: HOLD, lead: LEAD });
      const per = analyse(rec, regions, H);
      out.passes[ps.key] = Object.fromEntries(want.map((r) => { const c = per.get(r.id); return [r.id, { ...c, min: c.min === Infinity ? null : c.min }]; }));
      out.foot[ps.key] = { drawn: rec.q.drawn - before.drawn, missed: rec.q.missed - before.missed };
      out.q = rec.q;
    }
    out.logs = logs; out.errors = errors;
    return out;
  } finally { await ctx.close(); }
}

const worstOf = (a, b) => (!a ? b : !b ? a : { frames: a.frames + b.frames, min: a.min == null ? b.min : b.min == null ? a.min : Math.min(a.min, b.min), via: (b.min != null && (a.min == null || b.min < a.min)) ? b.via : a.via, worst: Math.max(a.worst, b.worst), over33: a.over33 + b.over33, over50: a.over50 + b.over50, q: Math.max(a.q, b.q) });

const newAgg = () => ({ regions: [], passes: {}, q: {}, foot: {}, logs: [], errors: [], okRuns: {}, misses: [], runs: 0, load: [+os.loadavg()[0].toFixed(1)] });
/** Fold one run into the aggregate of its base: the worst of every cell, the sum of the footage counters, in how many runs a chapter was within budget on its own. */
function fold(agg, one) {
  agg.runs++; agg.load.push(+os.loadavg()[0].toFixed(1));
  agg.regions = one.regions; agg.renderer = one.renderer; agg.logs.push(...one.logs); agg.errors.push(...one.errors);
  for (const id of one.regions) if (Object.values(one.passes).every((p) => ok(p[id]))) agg.okRuns[id] = (agg.okRuns[id] || 0) + 1;
  for (const [k, v] of Object.entries(one.passes)) for (const [id, c] of Object.entries(v)) if (!ok(c)) agg.misses.push(`run ${agg.runs} ${id} ${k}: ${c.min ?? '-'} fps / ${c.worst.toFixed(1)} ms${c.via ? ` (slowest frame in ${c.via})` : ''}`);   // where each miss was: the same cell in every run is a defect, a different one each time is the machine
  for (const [k, v] of Object.entries(one.passes)) { agg.passes[k] = agg.passes[k] || {}; for (const [id, c] of Object.entries(v)) agg.passes[k][id] = worstOf(agg.passes[k][id], c); }
  for (const [k, v] of Object.entries(one.foot)) { const f = agg.foot[k] || { drawn: 0, missed: 0 }; agg.foot[k] = { drawn: f.drawn + v.drawn, missed: f.missed + v.missed }; }
}

async function fpsMain() {
  const prev = opt.compare ? JSON.parse(readFileSync(opt.compare, 'utf8')) : null, all = { meta: { bases: BASES, labels: LABELS, cpu: CPU, lang: LANG, runs: RUNS, budget: BUDGET, only: ONLY }, results: {} };
  const keyOf = (bi, vp, theme) => (BASES.length > 1 ? `${LABELS[bi]}@${vp}:${theme}` : `${vp}:${theme}`);
  for (const theme of THEMES) for (const vp of VPS) {
    const prof = PROFILES[vp], aggs = BASES.map(newAgg), dead = new Set();
    for (let r = 0; r < RUNS; r++) for (let bi = 0; bi < BASES.length; bi++) {          // run by run, the bases in turn: whatever the machine is doing hits all of them alike
      if (dead.has(bi)) continue;
      // a browser PROCESS per run: the GPU process keeps the programs it compiled, so a second run in the same process would not pay for the compile a first visit pays for (and one base would warm the next)
      const browser = await chromium.launch({ headless: true, args: LAUNCH, ...(opt.exe ? { executablePath: opt.exe } : {}) });
      try { fold(aggs[bi], await fpsRun(browser, BASES[bi], vp, theme, r)); } catch (e) { fail(`${LABELS[bi]} ${prof.name} ${theme}: ${e.message}`); dead.add(bi); } finally { await browser.close(); }
    }
    for (let bi = 0; bi < BASES.length; bi++) {
      const agg = aggs[bi]; if (!agg.regions.length) continue;
      all.results[keyOf(bi, vp, theme)] = agg;
      const keys = Object.keys(agg.passes), head = `${BASES.length > 1 ? `[${LABELS[bi]}] ` : ''}${prof.name}, ${theme}, CPU x${CPU}${RUNS > 1 ? `, worst of ${agg.runs} runs${BASES.length > 1 ? ' (interleaved)' : ''}` : ''}   (min fps in any 1 s window ending in the chapter / worst frame ms in it; ! = over budget; ~ = the slowest frame of that window is in the chapter before)`;
      console.log(`\n${head}\n  GL: ${agg.renderer}   machine load (1 min avg, ${os.cpus().length} cores) at the start and after each run: ${agg.load.join(' -> ')}`);
      console.log(`  ${'chapter'.padEnd(8)}${keys.map((k) => k.padEnd(16)).join('')}q  verdict${agg.runs > 1 ? ' (runs ok)' : ''}${prev ? '   before' : ''}`);
      let bad = 0; const notes = [];
      for (const id of agg.regions) {
        for (const k of keys) { const c = agg.passes[k][id]; if (c && c.via && c.min != null && c.min < BUDGET.fps) notes.push(`${id} ${k}: ${c.min} fps in a window whose slowest frame is in ${c.via}`); }
        const cs = keys.map((k) => agg.passes[k][id]), good = cs.every(ok), q = Math.max(...cs.map((c) => (c ? c.q : 0)));
        if (!good) { bad++; if (bi === BASES.length - 1) failed++; }                   // with two bases, the first is the baseline: shown, not judged
        let before = '';
        if (prev) { const p = prev.results?.[keyOf(bi, vp, theme)]?.passes; before = '   ' + keys.map((k) => { const c = p?.[k]?.[id]; return c ? `${c.min ?? '-'}/${c.worst.toFixed(0)}` : 'n/a'; }).join('  '); }
        const runsOk = agg.runs > 1 ? ` ${agg.okRuns[id] || 0}/${agg.runs}` : '';
        console.log(`  ${id.padEnd(8)}${cs.map((c) => cell(c).padEnd(16)).join('')}${String(q).padEnd(3)}${(good ? 'ok' : 'FAIL') + runsOk}${before}`);
      }
      for (const nn of notes) console.log(`  note: ${nn}`);
      for (const m of agg.misses) console.log(`  miss: ${m}`);
      const foot = Object.entries(agg.foot).map(([k, f]) => `${k} ${f.missed}/${f.drawn}`).join(', ');
      console.log(`  footage drawn from a stand-in frame / frames drawn: ${foot}`);
      if (agg.logs.length) console.log(`  quality steps said: ${[...new Set(agg.logs)].map((l) => l.replace('[v3] quality ', '').replace(/ \(this device.*$/, '')).join(' | ')}`);
      if (agg.errors.length) console.log(`  console: ${[...new Set(agg.errors)].slice(0, 4).join(' | ')}`);
      console.log(`  ${bad ? `${bad} chapter(s) over budget` : 'every chapter within budget'}`);
    }
    if (BASES.length > 1 && aggs.every((a) => a.regions.length)) {                       // the builds side by side
      const keys = Object.keys(aggs[0].passes), w = 15 * keys.length + 9;
      console.log(`\n${prof.name}, ${theme}, CPU x${CPU}, worst of ${RUNS} interleaved runs: ${LABELS.join('  vs  ')}   (min fps / worst frame ms)`);
      console.log(`  ${'chapter'.padEnd(8)}${LABELS.map((l) => l.slice(0, w - 2).padEnd(w)).join('')}`);
      console.log(`  ${''.padEnd(8)}${LABELS.map(() => (keys.map((k) => k.padEnd(15)).join('') + 'runs ok ').padEnd(w)).join('')}`);
      for (const id of aggs[0].regions) console.log(`  ${id.padEnd(8)}${aggs.map((a) => (keys.map((k) => cell(a.passes[k][id]).padEnd(15)).join('') + `${a.okRuns[id] || 0}/${a.runs}`.padEnd(8))).join('')}`);
      console.log(`  footage stand-in / drawn: ${aggs.map((a, i) => `[${LABELS[i]}] ${Object.entries(a.foot).map(([k, f]) => `${k} ${f.missed}/${f.drawn}`).join(', ')}`).join('   ')}`);
    }
  }
  if (opt.json) writeFileSync(opt.json, JSON.stringify(all, null, 1));
}

// ---------- animated nodes ----------
async function nodesMain() {
  const browser = await chromium.launch({ headless: true, args: LAUNCH, ...(opt.exe ? { executablePath: opt.exe } : {}) });
  try {
    for (const vp of VPS) {
      const prof = PROFILES[vp];
      let o;
      try { o = await open(browser, prof, THEMES[0]); } catch (e) { fail(`${prof.name}: ${e.message}`); continue; }
      try {
        // every node a style was written on, and every node added, in a whole slow pass; counted per chapter. (Not part of the fps numbers: a MutationObserver is itself a cost.)
        await o.page.evaluate(() => {
          window.__w = new Map(); const sec = (n) => (n.closest && n.closest('main > section[id], section[id].sec, footer.endp')) || null, mark = (n) => { const s = sec(n); if (s) { const k = s.id || 'footer'; if (!window.__w.has(k)) window.__w.set(k, new Set()); window.__w.get(k).add(n); } };
          new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') mark(m.target); else for (const n of m.addedNodes) if (n.nodeType === 1) { mark(n); n.querySelectorAll('*').forEach(mark); } } })
            .observe(document.querySelector('main') || document.body, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true });
        });
        const regions = await regionsOf(o.page), H = prof.viewport.height, docH = await o.page.evaluate(() => document.documentElement.scrollHeight);
        await drive(o.page, { y0: 0, y1: docH - H, speed: prof.speeds[1], hold: HOLD });
        const got = await o.page.evaluate(() => Object.fromEntries([...window.__w].map(([k, v]) => {
          const kinds = {}; for (const n of v) { const k2 = n.tagName.toLowerCase() + (n.classList && n.classList.length ? '.' + n.classList[0] : ''); kinds[k2] = (kinds[k2] || 0) + 1; }
          return [k, { n: v.size, kinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8) }];
        })));
        console.log(`\n${prof.name}: nodes a style was written on, per chapter (budget ${BUDGET.nodes})`);
        for (const r of regions) {
          const n = got[r.id]?.n ?? 0, cap = PINNED[r.id] ?? BUDGET.nodes; if (n > cap) failed++;
          console.log(`  ${r.id.padEnd(8)}${String(n).padStart(4)}  ${n > cap ? 'OVER' : n > BUDGET.nodes ? `PINNED at ${cap} (over the ${BUDGET.nodes} it started over)` : 'ok'}${n > BUDGET.nodes * 0.9 ? `   (${got[r.id].kinds.map(([k, c]) => `${k} ${c}`).join(', ')})` : ''}`);
        }
      } finally { await o.ctx.close(); }
    }
  } finally { await browser.close(); }
}

// ---------- the ratchet, end to end ----------
async function ratchetMain() {
  const ORDER = ['pr125', 'pr100', 'blur', 'ca', 'bloom'];
  const browser = await chromium.launch({ headless: true, args: LAUNCH, ...(opt.exe ? { executablePath: opt.exe } : {}) });
  try {
    const vp = VPS[0], prof = PROFILES[vp];
    let o;
    try { o = await open(browser, prof, THEMES[0]); } catch (e) { fail(`${prof.name}: ${e.message}`); return; }
    try {
      const regions = await regionsOf(o.page), c01 = regions.find((r) => r.id === 'c01'), H = prof.viewport.height;
      if (!c01) { fail('no c01 on the page'); return; }
      const hero = { y0: 0, y1: Math.min(c01.bottom - H, c01.top + 4 * H), speed: 160, hold: 500 };
      const s0 = await o.page.evaluate(() => globalThis.__v3Q());
      console.log(`\nratchet self-test, ${prof.name}, CPU x${CPU}: ladder of ${s0.of} steps, pixel ratio ${s0.pr}, at step ${s0.q}`);
      let st = s0, rounds = 0;
      while (st.q < Math.min(2, st.of) && rounds++ < 6) { await drive(o.page, hero); st = await o.page.evaluate(() => globalThis.__v3Q()); }
      const said = o.logs.map((l) => /quality (\d+)\/(\d+): (.*?) \(/.exec(l)).filter(Boolean);
      const dq = await o.page.evaluate(() => +document.documentElement.dataset.q || 0);
      const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failed++; };
      check(st.q >= 1, `throttled x${CPU}, the ratchet gave up something (step ${st.q} of ${st.of} after ${rounds} passes over the hero)`);
      check(JSON.stringify(st.steps) === JSON.stringify(ORDER.filter((s) => st.steps.includes(s))), `the steps came in the order of the ladder (${st.steps})`);
      check(new Set(st.steps).size === st.steps.length, 'no step twice');
      check(said.length === st.q && said.every((m, i) => +m[1] === i + 1), `each step is said once in the console (${said.length} lines for ${st.q} steps)`);
      check(dq === st.q, `<html data-q> says the step the visit is at (${dq})`);
      check(st.pr <= s0.pr && (st.q < 1 || st.steps[0] !== 'pr125' || st.pr <= 1.25), `the pixel ratio only went down (${s0.pr} -> ${st.pr})`);
      await o.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const hi = st.q;
      for (let k = 0; k < 2; k++) await drive(o.page, { ...hero, speed: 600 });
      const after = await o.page.evaluate(() => globalThis.__v3Q());
      check(after.q === hi && after.pr === st.pr, `unthrottled and scrolled again, nothing comes back up (step ${after.q}, pixel ratio ${after.pr})`);
      const canvas = await o.page.evaluate(() => { const c = document.getElementById('gl'); return c ? c.width : 0; });
      check(canvas > 0 && Math.abs(canvas - Math.round(prof.viewport.width * st.pr)) <= 1, `the canvas is ${canvas} px wide: the viewport at the pixel ratio the ratchet ended on (${prof.viewport.width} x ${st.pr})`);
    } finally { await o.ctx.close(); }
  } finally { await browser.close(); }
}

try {
  if (opt.nodes) await nodesMain(); else if (opt.ratchet) await ratchetMain(); else await fpsMain();
} catch (e) { fail(e.message); }
console.log(failed ? `\nv3-fps: ${failed} check(s) FAILED` : '\nv3-fps: ok');
process.exit(failed ? 1 : 0);
