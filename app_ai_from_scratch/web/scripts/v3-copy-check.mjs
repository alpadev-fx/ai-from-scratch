// Copy gate for /v3, stage 2A: the Hormozi sales argument on the 17 AEGIS chapters. The owner's rules, each one a real past failure.
//   BASE=http://127.0.0.1:4321 node --experimental-strip-types web/scripts/v3-copy-check.mjs
// It fetches the SERVER-RENDERED page in both languages and for six markets (the Colombian narrative is the one that carries a
// city) and fails (exit 1) on:
//   · the 17 chapter ids missing, duplicated or out of order, or one of the 7 retired ids back;
//   · any key string of a chapter missing FROM ITS OWN chapter (a chapter silently emptied is the same failure as a forbidden
//     word kept), in ES and in EN;
//   · any hard copy rule of src/aegis/copy-guard.ts (the SAME table the page's guard() throws on) in the visible text, the
//     attributes or the JSON the page ships: cities (except inside the tokenizer example), plural courses, the Hormozi §0.4 list,
//     monthly wording, «veinte segundos», the cat prompt (except the published lesson-01 caption), a testimonial;
//   · the one sanctioned «testimonios» sentence not appearing exactly once, a currency amount that is not the published price,
//     a paid CTA that is not /pago, a hero pair that is not paid /pago then free /registro with the trust line under both, the offer not being seven items, preWhy2 shown
//     twice, a missing noindex, a Meta Pixel, and the Δ chapter's token rules (next-token candidates only after specimen B's
//     own context, which is cut by the specimen tokenizer, never by spaces).
// Before it judges the real pages it proves, on MUTATED copies of the page, that every one of these rules CAN fail (and that the
// two exemptions stay narrow). If the page cannot be fetched or a self-test cannot fail, the gate FAILS: it never skips.
import { readFileSync } from 'node:fs';
import { STR } from '../src/lib/i18n.ts';
import { PRECIO_VISUAL, PRECIO_TEXTO } from '../src/lib/price.ts';
import { preguntas, modulos, candidatos } from '../src/data/landing.ts';
import { ctxOf, tokenize } from '../src/aegis/specimens.ts';
import { SANCTIONED, guard, violations } from '../src/aegis/copy-guard.ts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4321';
// The narrative changes with the visitor's market, so every market is fetched: a city that only shows for one market is the
// failure this gate exists for.
const MARKETS = [null, 'CO', 'US', 'MX', 'ES', 'JP'];
const LANGS = ['es', 'en'];
// 00 ignition (the overlay) · 01 hero · 02 te ha pasado · 03 qué cambia · 04 por dentro (Δ, id cL) · 05 cifras · 06 lo que no
// necesitas · 07 el tiempo · 08 prueba · 09 temario · 10 la oferta · 11 garantía · 12 quién · 13 para quién · 14 precio · 15 FAQ · 16 cierre
const CHAPTERS = ['ign', 'c01', 'c02', 'c03', 'cL', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16'];
const LEGACY = ['especimenes', 'indice', 'ventajas', 'quien', 'vivo', 'precio', 'faq'];
const CTA_CHAPTERS = ['c03', 'c07', 'c10', 'c11'];       // CTA rows with the price label + the guarantee line; c14 has its in-card button; c16 closes
const ALLOWED_NUM = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '23', '24', '30', '31', '36', '40', '94', '100', '100.000', '100,000',
  '39.990', '39,990', '70.000.000.000', '70,000,000,000', '18,615', '0.30', '0', '000', '1.1', '18', '20', '70', '83', ...Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0'))]);

// ---------- reading the rendered page ----------
const decode = (x) => x.replace(/&nbsp;/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const norm = (x) => decode(x).replace(/\s+/g, ' ').trim();
const stripCode = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script(?![^>]*application\/json)[\s\S]*?<\/script>/g, ' ');
const textOf = (h) => norm(stripCode(h).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
const attrsOf = (h) => [...stripCode(h).matchAll(/\s(?:alt|aria-label|title|placeholder|content|value|data-text|label)="([^"]*)"/g)].map((m) => norm(m[1]));
function jsonStrings(h) {
  const out = [], walk = (v) => { if (typeof v === 'string') out.push(norm(v)); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const m of h.matchAll(/<script[^>]*application\/json[^>]*>([\s\S]*?)<\/script>/g)) walk(JSON.parse(m[1]));
  return out;
}
/** Everything a visitor (or a crawler) can read: the visible text, the text-bearing attributes and the JSON the page ships. */
const copyOf = (h) => [textOf(h), ...attrsOf(h), ...jsonStrings(h)].join(' ¦ ');

/** The page cut at the chapter ids. Returns `{ id: { n, at, html } }`; `n` is how many elements carry the id. */
function chaptersOf(h) {
  const found = CHAPTERS.map((id) => { const all = [...h.matchAll(new RegExp(`<(?:section|div)\\b[^>]*\\bid="${id}"`, 'g'))]; return { id, n: all.length, at: all[0]?.index ?? -1 }; });
  const end = h.indexOf('</main>') >= 0 ? h.indexOf('</main>') : h.length;
  const out = {};
  found.forEach((c, i) => { const next = found.slice(i + 1).find((x) => x.at >= 0); out[c.id] = { ...c, html: c.at < 0 ? '' : h.slice(c.at, next ? next.at : end) }; });
  return out;
}

// ---------- what each chapter must say, from the SAME strings the page reads ----------
function required(lang) {
  const P = STR[lang].pub.land, V = STR[lang].pub.v3, big = PRECIO_VISUAL[lang];
  const fill = (s) => s.split('{precio}').join(big);
  const mods = modulos(lang), mod = (n) => mods.find((m) => m.n === n);
  const ctx = ctxOf(P.bD), lab = (n, s) => `${n} — ${s}`;
  const cta = [['cta label', P.preCta], ['cta guarantee line', P.heroGar]];
  return {
    ign: [['ignition log', V.ignLog]],
    c01: [['label', lab('01', V.heroEb)], ['h1', V.heroH], ['h2 line', V.heroH2], ['sub', V.heroSub], ['paid cta', P.preCta], ['free cta', P.heroCta], ['trust line', V.heroConfianza],
      ['hud', V.cifra], ['hud', V.fuente], ['hud', V.ilus], ['card title', V.sintomas],
      ...[1, 2, 3].flatMap((i) => [[`symptom ${i} lesson`, P[`s${i}Lec`]], [`symptom ${i}`, P[`s${i}H`]], [`symptom ${i} cause`, P[`s${i}C`]]])],
    c02: [['label', lab('02', V.s1Eb)], ['h2', V.s1H], ...V.s1Beats.flatMap((b, i) => [[`beat ${i + 1} you`, b.tu], [`beat ${i + 1} ai`, b.ia], [`beat ${i + 1} tag`, b.tag]]),
      ['earlier', V.s1Earlier], ['gap', V.s1Gap], ['shout', V.s1Cierre], ['you', V.chatTu], ['ai', V.chatIa]],
    c03: [['label', lab('03', V.ch03)], ['h2', P.llevasH2], ['l1', P.l1H], ['l1', P.l1D], ['l2', P.l2H], ['l2', P.l2D], ['l3', P.l3H], ['l3', P.l3D], ...cta],
    cL: [['label', lab('04', V.ch04)], ['h2', V.adentroH], ['sub', P.aD], ['context', ctx], ['candidates', V.cand], ['dial', V.tabTemp],
      ...['05', '06', '08', '09'].flatMap((n) => [[`step ${n} lesson`, `${V.lec} ${n}`], [`step ${n} h`, mod(n).h], [`step ${n} d`, mod(n).d]])],
    c05: [['label', lab('05', V.ch05)], ...mods.slice(0, 6).flatMap((m) => [[`fig ${m.n} eyebrow`, m.eb], [`fig ${m.n} number`, m.k], [`fig ${m.n} caption`, m.kc], [`fig ${m.n} h`, m.h], [`fig ${m.n} d`, m.d]])],
    c06: [['label', lab('06', V.s3Eb)], ...V.s3Palabras.map((w) => ['struck word', w]), ['h2', V.s3H]],
    c07: [['label', lab('07', V.ch07)], ['h2', V.s4H], ['lede', V.s4Sub], ...V.specs.flatMap((s) => [['figure', String(s.k)], ['figure caption', s.d]]), ...cta],
    c08: [['label', lab('08', V.ch08)], ['h2', V.s5H], ['sub', V.s5Sub], ['specimen B', V.s5Eb], ['interactive', P.espInter], ['prompt', ctx], ['candidates', V.cand],
      ['temperature', P.bTemp], ['safe', P.bSeguro], ['predictable', P.bPredecible], ['risky', P.bArriesga], ['button', V.s5Boton],
      ['specimen A', P.aLbl], ['specimen A h', P.aH], ['specimen A d', P.aD], ['specimen A example', P.aEjemplo], ['tokens', P.aTokens], ['words', P.aPalabras], ['letters', P.aLetras]],
    c09: [['label', lab('09', V.ch09)], ['h2', P.indH2], ['sub', P.indSub], ...mods.flatMap((m) => [[`lesson ${m.n} eyebrow`, m.eb], [`lesson ${m.n} h`, m.h], [`lesson ${m.n} d`, m.d], [`lesson ${m.n} number`, m.k], [`lesson ${m.n} caption`, m.kc]])],
    c10: [['label', lab('10', V.ch10)], ['h2', fill(V.s7H)], ...V.s7Items.flatMap((it, i) => [[`item ${i + 1}`, it.t], [`item ${i + 1} d`, fill(it.d)]]),
      ['item 6', V.s7Next], ['item 6 d', V.vivoV], ['item 7', V.s7Gar.t], ['item 7 d', fill(V.s7Gar.d)], ...cta],
    c11: [['label', lab('11', V.ch11)], ['h2', V.s8H], ['body', fill(V.s8Body)], ['seal text', V.s8Sello], ['seal core', '14'], ...cta],
    c12: [['label', lab('12', V.instrEb)], ['h2', V.instrH], ['body', V.instrBody], ['emphasis', V.instrEnfasis], ['close', V.instrCierre]],
    c13: [['label', lab('13', V.ch13)], ['yes h', V.s10TituloSi], ...V.s10Si.map((x) => ['yes', x]), ['no h', V.s10TituloNo], ...V.s10No.map((x) => ['no', x])],
    c14: [['label', lab('14', V.ch14)], ['h2', P.preH2], ['price', big], ['unit', P.preUnidad], ['note', P.preNota], ['cta', P.preCta], ['why h', P.preWhyH],
      ['why 1', P.preWhy1], ['why 2', P.preWhy2], ['why 3', V.preWhy3V], ['why 4', P.preWhy4], ['guarantee', P.preGar], ['terms', P.preTerm],
      ['includes', P.incluye], ['inc 1', P.pre1], ['inc 2', P.pre2], ['inc 3', P.pre3]],
    c15: [['label', lab('15', V.ch15)], ['h2', P.faqH2], ...preguntas(lang).flatMap((f, i) => [[`faq ${i + 1} q`, f.q], [`faq ${i + 1} a`, i === 3 ? V.faqIncluyeA : f.a]])],
    c16: [['label', lab('16', V.ch16)], ...V.s14Pasos.map((s, i) => [`step ${i + 1}`, s]), ['h2', V.cierreH], ['cta', P.cierreCta], ['foot', P.pieHand], ['foot', P.pieMeta2]],
  };
}

// ---------- Δ context rule (unchanged by stage 2A) ----------
// The candidates (Max, Luna…) answer specimen B's context («Le pediste un nombre para tu perro.»); they must never sit next to
// the Cartagena tokens, not even in the server-rendered markup the no-JS / reduced-motion / no-WebGL visitor gets. The string is
// a cut of bD (ctxOf), so there is no new copy; this reads the STRUCTURE of the Δ chapter.
function deltaRule(html, lang) {
  const out = [], ctx = ctxOf(STR[lang].pub.land.bD), names = candidatos(lang).map((c) => c.name);
  const sec = (html.match(/<section class="ch" id="cL"[\s\S]*?<\/section>/) ?? [''])[0];
  const iA = sec.indexOf('<div class="chips"'), iB = sec.indexOf('<div class="chips ctx"');
  if (!sec || iA < 0 || iB < iA) return ['chapter or its two chip rows missing / out of order'];
  const rowA = sec.slice(iA, iB), rowB = sec.slice(iB, sec.indexOf('<aside', iB));
  const nA = (rowA.match(/class="tk"/g) ?? []).length;
  if (nA !== 5) out.push(`the Cartagena row has ${nA} chips, expected 5`);
  if (/class="[^"]*\bans\b[^"]*"/.test(rowA)) out.push('a candidate chip (.ans) is inside the Cartagena row');
  const textA = norm(rowA.replace(/<[^>]+>/g, ' '));
  for (const n of names) if (textA.includes(n)) out.push(`candidate name "${n}" is in the Cartagena row`);
  // the context row is cut by the SAME tokenizer as the Cartagena row (lesson 05: «no ve palabras, ve trozos»), never by spaces
  const chips = [...rowB.matchAll(/<div class="tk cw" data-w="(\d+)"><b>([^<]*)<\/b><\/div>/g)].map((m) => ({ w: +m[1], t: decode(m[2]) }));
  const want = tokenize(ctx), got = chips.map((c) => c.t);
  if (got.length !== want.length || got.some((t, i) => t !== want[i])) out.push(`context row chips are [${got.join(' | ')}], expected tokenize(ctx) = [${want.join(' | ')}]`);
  if (((rowB.match(/class="tk cw"/g) ?? []).length) !== chips.length) out.push('a context chip has no data-w word index');
  const regroup = []; for (const c of chips) regroup[c.w] = (regroup[c.w] ?? '') + c.t;
  if (norm(regroup.join(' ')) !== norm(ctx)) out.push(`the context chips regroup into "${regroup.join(' ')}", expected "${ctx}"`);
  const ans = (html.match(/class="tk ans"/g) ?? []).length;
  if (ans !== 1) out.push(`${ans} candidate chips on the page, expected exactly 1 (after the context row)`);
  else if (html.indexOf('class="tk ans"') < html.indexOf('<div class="chips ctx"')) out.push('the candidate chip comes before the context row');
  const pc = sec.match(/<p class="pctx">([\s\S]*?)<\/p>/);
  if (!pc || norm(pc[1]) !== norm(ctx)) out.push(`the card context line is "${pc ? norm(pc[1]) : '(missing)'}", expected "${ctx}"`);
  return out;
}

// ---------- the judge ----------
/** Every way the rendered page can be wrong, as `category: message` strings. Empty = the page is right. */
function judge(html, lang) {
  const f = [], P = STR[lang].pub.land, V = STR[lang].pub.v3, big = PRECIO_VISUAL[lang];
  const kc01 = norm(modulos(lang)[0].kc);          // lesson 01's published caption is the only text that may say «gatos» / "cat"

  // meta
  if (!/<meta name="robots" content="noindex/.test(html)) f.push('meta: no noindex');
  if (/connect\.facebook\.net|fbq\(|facebook\.com\/tr/.test(html)) f.push('meta: Meta Pixel present');
  if ((html.match(/<h1\b/g) ?? []).length !== 1) f.push(`meta: ${(html.match(/<h1\b/g) ?? []).length} <h1> on the page, expected 1`);
  let corpus;
  try { corpus = copyOf(html); } catch (e) { return [...f, `meta: the page ships JSON that does not parse (${e.message})`]; }

  // chapters: all 17 ids, once each, in order; none of the retired ones; 16 <section>
  const ch = chaptersOf(html);
  for (const id of CHAPTERS) if (ch[id].n !== 1) f.push(`chapters: #${id} appears ${ch[id].n} times, expected 1`);
  const order = CHAPTERS.filter((id) => ch[id].at >= 0).map((id) => ch[id].at);
  if (order.some((at, i) => i && at < order[i - 1])) f.push(`chapters: out of order, expected ${CHAPTERS.join(' > ')}`);
  for (const id of LEGACY) if (new RegExp(`\\bid="${id}"`).test(html)) f.push(`chapters: retired id #${id} is back`);
  if ((html.match(/<section\b/g) ?? []).length !== 16) f.push(`chapters: ${(html.match(/<section\b/g) ?? []).length} <section> elements, expected 16`);

  // key strings, each one inside ITS chapter
  const need = required(lang);
  for (const id of CHAPTERS) {
    const slice = ch[id].html; if (!slice) continue;
    const have = copyOf(slice);
    for (const [what, str] of need[id]) {
      if (typeof str !== 'string' || !str) { f.push(`copy: #${id} requires "${what}" but that string does not exist in i18n (${typeof str})`); continue; }   // fail closed on a gate that cannot know what to look for
      if (!have.includes(norm(str))) f.push(`copy: #${id} is missing "${what}": "${norm(str).slice(0, 70)}"`);
    }
  }

  // hard copy rules over everything readable (the rule table is the page's own)
  const allow = [kc01];
  for (const [rule, hit] of violations(corpus, allow)) f.push(`rules: ${rule} ("${hit}")`);
  const sanctioned = (corpus.match(SANCTIONED) ?? []).length;
  if (sanctioned !== 1) f.push(`rules: the sanctioned «testimonios» sentence appears ${sanctioned} times, expected exactly 1`);
  else if (!copyOf(ch.c08.html).match(SANCTIONED)) f.push('rules: the sanctioned «testimonios» sentence is not in chapter 08');
  if (/\{precio\}|undefined|\[object Object\]|\bNaN\b/.test(corpus)) f.push('rules: a placeholder or an undefined value leaked into the copy');

  // prices: every currency amount on the page is the published price, in the language's notation, and never a literal of ours
  const okPrice = new Set([big, `${PRECIO_TEXTO[lang]} COP`]);
  for (const m of new Set(corpus.match(/\$\s?\d[\d.,]*\d|\d[\d.,]*\d\s?COP/g) ?? [])) if (!okPrice.has(m)) f.push(`price: "${m}" is not the published price (${[...okPrice].join(' / ')})`);
  if (!ch.c14.html.includes(`<b data-odo>${big}</b>`)) f.push(`price: chapter 14's odometer figure is not ${big}`);

  // CTAs: the hero pair (paid /pago, then free /registro), every other paid one /pago with the outcome and the price in its label, no stray routes
  // the hero is Hormozi's pair, adapted to prod: the PAID button first (prod preCta -> /pago; no ?renovar, renewal is off by default), the FREE one
  // second (prod heroCta -> /registro), the trust line under both
  const hp = `<a href="/pago" class="buy big" data-cta><span>${P.preCta}</span>`, hf = `<a href="/registro" class="buy big alt" data-cta><span>${P.heroCta}</span>`;
  const iP = ch.c01.html.indexOf(hp), iF = ch.c01.html.indexOf(hf), iT = ch.c01.html.indexOf('<p class="micro">');
  if (iP < 0) f.push('cta: the hero has no primary paid /pago button with the published label (prod preCta)');
  if (iF < 0) f.push('cta: the hero has no secondary free /registro button with the published label (prod heroCta)');
  if (iP >= 0 && iF >= 0 && iF < iP) f.push('cta: the hero shows the free button before the paid one');
  if (iF >= 0 && (iT < 0 || iT < iF)) f.push('cta: the hero trust line is not under both buttons');
  if ((ch.c01.html.match(/href="\/pago/g) ?? []).length !== 1 || (ch.c01.html.match(/href="\/registro/g) ?? []).length !== 1) f.push('cta: the hero must link /pago once and /registro once');
  if (/href="[^"]*renovar/.test(html)) f.push('cta: a link carries ?renovar (renewal is off by default)');
  const rows = [...html.matchAll(/<div class="ctarow" data-cta[^>]*>([\s\S]*?)<\/div>/g)];
  const rowOf = (id) => rows.filter((r) => ch[id].at >= 0 && r.index >= ch[id].at && r.index < ch[id].at + ch[id].html.length);
  for (const id of CTA_CHAPTERS) {
    const r = rowOf(id);
    if (r.length !== 1) { f.push(`cta: #${id} has ${r.length} CTA rows, expected 1`); continue; }
    const m = r[0][1].trim().match(/^<a href="([^"]*)" class="buy big"><span>([^<]*)<\/span>[\s\S]*<\/a>\s*<p>([^<]*)<\/p>$/);
    if (!m) { f.push(`cta: #${id} CTA row has an unexpected shape`); continue; }
    if (m[1] !== '/pago') f.push(`cta: #${id} CTA goes to ${m[1]}, expected /pago`);
    if (norm(m[2]) !== norm(P.preCta)) f.push(`cta: #${id} CTA label is "${norm(m[2])}", expected "${norm(P.preCta)}"`);
    if (norm(m[3]) !== norm(P.heroGar)) f.push(`cta: #${id} CTA guarantee line is "${norm(m[3])}", expected "${norm(P.heroGar)}"`);
  }
  const close = rowOf('c16');
  if (close.length !== 1) f.push(`cta: #c16 has ${close.length} CTA rows, expected 1`);
  else {
    const m = close[0][1].trim().match(/^<a href="([^"]*)" class="buy big"><span>([^<]*)<\/span>/);
    if (!m || m[1] !== '/pago' || norm(m[2]) !== norm(P.cierreCta)) f.push(`cta: #c16 closing CTA is not /pago with "${norm(P.cierreCta)}"`);
  }
  if (!ch.c14.html.includes(`<a href="/pago" class="buy big" data-cta><span>${P.preCta}</span>`)) f.push('cta: chapter 14 has no in-card /pago button with the published label');
  if ((html.match(/\bdata-cta\b/g) ?? []).length !== 8) f.push(`cta: ${(html.match(/\bdata-cta\b/g) ?? []).length} CTAs marked data-cta, expected 8 (the hero pair, after 03, 07, 10, 11, 14 and the closing)`);
  for (const label of [P.preCta, P.cierreCta]) if (!label.includes(big)) f.push(`cta: label "${label}" does not name the price ${big}`);
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) if (/suscri|mensual|subscri|monthly/i.test(m[1])) f.push(`cta: link to ${m[1]}`);

  // the offer is seven items, in order: the five Hormozi ones, «lo que publique después» (+ the published vivoV), the guarantee
  const items = [...ch.c10.html.matchAll(/<li data-dock-item><span class="no">(\d\d)<\/span><div class="it"><p class="t">([\s\S]*?)<\/p><p class="d">([\s\S]*?)<\/p><\/div><\/li>/g)];
  if (items.length !== 7 || items.some((m, i) => +m[1] !== i + 1)) f.push(`offer: ${items.length} numbered items (a title and a description in two elements each), expected 7 in order`);
  else if (norm(items[5][2]) !== norm(V.s7Next) || norm(items[5][3]) !== norm(V.vivoV)) f.push('offer: item 6 is not «lo que publique después» with the published vivoV');
  else if (items.some((m) => /^\s*[—–-]/.test(m[3]) || /[—–]\s*$/.test(m[2]))) f.push('offer: a title and its description are joined by a dash again');

  // chapter 02 keeps the N3 hook; chapter 14 shows the four prod reasons in prod order, and preWhy2 only there
  if (!/data-seq="n3"/.test(ch.c02.html)) f.push('structure: chapter 02 lost the N3 hook (data-seq="n3")');
  const dup = textOf(html).split(norm(P.preWhy2)).length - 1;
  if (dup !== 1) f.push(`structure: preWhy2 appears ${dup} times, expected 1 (chapter 14 only)`);
  const t14 = textOf(ch.c14.html), pos = [P.preWhy1, P.preWhy2, V.preWhy3V, P.preWhy4].map((s) => t14.indexOf(norm(s)));
  if (pos.some((p, i) => p < 0 || (i && p < pos[i - 1]))) f.push('structure: the price reasons are not preWhy1, preWhy2, preWhy3V, preWhy4 in that order');
  if ((ch.c14.html.match(/<div class="pp">([\s\S]*?)<small>/)?.[1].match(/<p>/g) ?? []).length !== 3) f.push('structure: chapter 14 does not show the three trust lines of the market narrative');
  if ((ch.c14.html.match(/<div class="chipsrow">([\s\S]*?)<\/div>/)?.[1].match(/<span>/g) ?? []).length < 1) f.push('structure: chapter 14 shows no payment methods');
  if ((ch.c15.html.match(/<details>/g) ?? []).length !== 8) f.push('structure: the FAQ is not 8 questions');

  // boot: nothing in the engine may gate what the visitor reads. The hero copy is painted from the first frame, the ignition is ended by the
  // head script (a timer that needs no module), and a hung import cannot leave the page half-engine. The rendered page proves its three parts.
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  if (/:not\(\.ready\)[^{}]*\{[^}]*opacity\s*:\s*0/.test(css)) f.push('boot: a CSS rule hides copy until html.ready (the engine must never gate the hero copy)');
  if (/<(?:h1|div class="sub"|div class="cta"|div class="copy")[^>]*style="[^"]*opacity/.test(ch.c01.html)) f.push('boot: the hero copy is server-rendered hidden (inline opacity)');
  const bootJs = ((html.slice(0, html.indexOf('</head>')).match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? []).find((x) => x.includes("sessionStorage.getItem('v3_ign')"))) ?? '';
  if (!bootJs) f.push('boot: the head script that runs the ignition is missing');
  else for (const [what, re] of [['the 1200 ms cap on the ignition', /setTimeout\(end,1200\)/], ['ending on animationend', /animationend/], ['skipping on click', /'click'/], ['skipping on any key', /'keydown'/],
    ['skipping on wheel', /'wheel'/], ['skipping on touch', /'touchstart'/], ['the 15 s watchdog', /\},15000\)/]]) if (!re.test(bootJs)) f.push(`boot: the head script lost ${what}`);
  if (/class="pct"/.test(ch.ign.html)) f.push('boot: the ignition shows a loading counter that is not bound to anything real');

  // chapter 04 ends with its last tab: no closing line that points at specimens now living in chapter 08, and a scroll length the engine's
  // timeline is scaled for (llm.ts: GIVEN). A mismatch would change the pacing of every beat without any error.
  if (textOf(html).includes(norm(P.espH2))) f.push(`structure: chapter 04 closes on «${norm(P.espH2)}» again (the specimens live in chapter 08)`);
  if (/class="lend\b/.test(ch.cL.html)) f.push('structure: chapter 04 has a .lend closing block again');
  const len = ch.cL.html.match(/id="cL" style="--len:([\d.]+)"/), given = +(readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').match(/GIVEN = ([\d.]+)/)?.[1] ?? NaN);
  if (!len || +len[1] !== given) f.push(`structure: chapter 04 is ${len ? len[1] : '(no --len)'} screens but llm.ts scales its timeline for ${given}`);

  for (const m of deltaRule(html, lang)) f.push(`delta: ${m}`);
  return f;
}

// ---------- self-tests: every rule must be able to fail, and the exemptions must stay narrow ----------
const poison = (h, s) => h.replace('</main>', `<p>${s}</p></main>`);
// Astro escapes text nodes (the apostrophe of «It's for you if» is &#39;), so a mutation that searches the markup must search the escaped string.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const swap = (h, a, b) => h.replace(`id="${a}"`, 'id="__"').replace(`id="${b}"`, `id="${a}"`).replace('id="__"', `id="${b}"`);
function mutants(html, lang) {
  const V = STR[lang].pub.v3, P = STR[lang].pub.land, big = PRECIO_VISUAL[lang], kc01 = modulos(lang)[0].kc;
  const sanct = esc(V.s5H.match(SANCTIONED)[0]), s3 = esc(V.s3H);
  const inChapter = (id, fn) => { const c = chaptersOf(html)[id]; return html.slice(0, c.at) + fn(c.html) + html.slice(c.at + c.html.length); };
  return [
    // [what, mutated page, regex the failures must match (or null = must stay clean of `rules:`)]
    ['a city outside the tokenizer example', poison(html, 'Hecho en Medellín'), /rules: city/],
    ['another city', poison(html, 'Desde Miami'), /rules: city/],
    ['the tokenizer example is exempt', poison(html, 'Cartagena es hermosa Cartagena is beautiful'), null],
    ['a near miss of the tokenizer example is a city', poison(html, 'Cartagena es bonita'), /rules: city/],
    ['plural courses', poison(html, 'cursos courses'), /rules: plural courses/],
    ['the old cover wording', poison(html, 'EBOOK · VOL. 1'), /rules: old cover/],
    ['a §0.4 word (singularidad)', poison(html, 'la singularidad singularity'), /rules: hormozi/],
    ['a §0.4 word (pago único)', poison(html, 'pago único'), /rules: hormozi/],
    ['monthly wording (/mes)', poison(html, `${big}/mes ${big}/month`), /rules: monthly wording/],
    ['monthly wording (Suscribirme)', poison(html, 'Suscribirme Subscribe Dos formas de entrar'), /rules: monthly wording/],
    ['monthly wording (a month)', poison(html, 'only 39,990 a month'), /rules: monthly wording/],
    ['«veinte segundos»', poison(html, 'en veinte segundos twenty seconds'), /rules: unpublished claim/],
    ['the cat prompt', poison(html, 'Mi gato se llama Max. My cat is called Max.'), /rules: cat/],
    ['lesson 01 caption stays exempt', poison(html, kc01), null],
    ['a testimonial outside its sentence', poison(html, 'Lo que dicen los testimonios y testimonials'), /rules: testimonial/],
    ['the sanctioned sentence twice', poison(html, sanct), /sanctioned «testimonios» sentence appears 2/],
    ['the sanctioned sentence gone', html.replace(sanct, 'x').replace(V.s5H.match(SANCTIONED)[0], 'x'), /sanctioned «testimonios» sentence appears 0|copy: #c08/],
    ['a leaked placeholder', poison(html, '{precio}'), /leaked/],
    ['a chapter id gone', html.replace('id="c07"', 'id="c07x"'), /chapters: #c07/],
    ['two chapters out of order', swap(html, 'c05', 'c06'), /chapters: out of order/],
    ['a retired id back', poison(html, '<section id="precio"></section>'), /chapters: retired id #precio/],
    ['a chapter emptied of its key string', inChapter('c06', (c) => c.split(s3).join('x')), /copy: #c06/],
    ['the Δ chapter without its h2', inChapter('cL', (c) => c.split(esc(V.adentroH)).join('x')), /copy: #cL/],
    ['a key string on the page but not in its chapter', poison(inChapter('c13', (c) => c.split(esc(V.s10TituloSi)).join('x')), V.s10TituloSi), /copy: #c13/],
    ['the N3 hook gone', html.replace('data-seq="n3"', 'data-x="n3"'), /structure: chapter 02 lost the N3 hook/],
    ['preWhy2 shown twice', poison(html, esc(P.preWhy2)), /structure: preWhy2 appears 2/],
    ['the price reasons out of order', inChapter('c14', (c) => c.replace(`<p>${esc(P.preWhy1)}</p><p>${esc(P.preWhy2)}</p>`, `<p>${esc(P.preWhy2)}</p><p>${esc(P.preWhy1)}</p>`)), /structure: the price reasons/],
    ['a price that is not the published one', inChapter('c10', (c) => c.replace(big, lang === 'es' ? '$40.000' : '40,000 COP')), /price:/],
    ['a dollar sign in English', lang === 'en' ? poison(html, '$39,990') : poison(html, '$99.999'), /price:/],
    ['a paid CTA that is not /pago', inChapter('c07', (c) => c.replace('href="/pago" class="buy big"', 'href="/suscribirme" class="buy big"')), /cta: #c07/],
    ['a paid CTA that does not name the price', inChapter('c10', (c) => c.replace(esc(P.preCta), 'COMPRAR')), /cta: #c10/],
    ['the free hero CTA going to /pago', inChapter('c01', (c) => c.replace('href="/registro"', 'href="/pago"')), /cta: the hero/],
    ['the paid hero CTA gone', inChapter('c01', (c) => c.replace(/<a href="\/pago" class="buy big" data-cta>[\s\S]*?<\/a>/, '')), /cta: the hero has no primary/],
    ['the hero pair swapped (free first)', inChapter('c01', (c) => { const m = c.match(/(<a href="\/pago" class="buy big" data-cta>[\s\S]*?<\/a>)(\s*)(<a href="\/registro" class="buy big alt" data-cta>[\s\S]*?<\/a>)/); return c.replace(m[0], m[3] + m[2] + m[1]); }), /cta: the hero shows the free button before the paid one/],
    ['the hero paid CTA with ?renovar=1', inChapter('c01', (c) => c.replace('href="/pago"', 'href="/pago?renovar=1"')), /cta: a link carries \?renovar/],
    ['the hero trust line above the buttons', inChapter('c01', (c) => { const t = c.match(/<p class="micro">[\s\S]*?<\/p>/)[0]; return c.replace(t, '').replace('<div class="ctas">', t + '<div class="ctas">'); }), /cta: the hero trust line is not under both buttons/],
    ['a CTA row gone', html.replace('<div class="ctarow" data-cta', '<div class="ctarow" data-x'), /cta:/],
    ['the offer short of an item', inChapter('c10', (c) => c.replace(/<li data-dock-item>(?![\s\S]*<li data-dock-item>)[\s\S]*?<\/li>/, '')), /offer:/],
    ['an offer item joined by a dash again', inChapter('c10', (c) => c.replace('</p><p class="d">', ' — ')), /offer:/],
    ['the offer item 6 swapped', inChapter('c10', (c) => c.replace(esc(V.s7Next), 'Bonus')), /offer:|copy: #c10/],
    ['a retired price notation (pago único)', poison(html, 'Pago único de $39.990'), /rules: hormozi/],
    ['a CSS rule that hides the hero copy until ready', html.replace('</head>', '<style>html.fx:not(.ready) .stage .copy .head{opacity:0}</style></head>'), /boot: a CSS rule hides copy/],
    ['the hero h1 server-rendered hidden', html.replace('<h1 class="head"', '<h1 style="opacity:0" class="head"'), /boot: the hero copy is server-rendered hidden/],
    ['the ignition without its 1.2 s cap', html.replace('setTimeout(end,1200)', 'setTimeout(end,12000)'), /boot: the head script lost the 1200 ms cap/],
    ['the ignition that cannot be skipped by wheel', html.replace("'wheel'", "'wheelx'"), /boot: the head script lost skipping on wheel/],
    ['the head script without the watchdog', html.replace('},15000);', '},15000000);'), /boot: the head script lost the 15 s watchdog/],
    ['a fake loading counter back in the ignition', html.replace('<button class="iskip"', '<div class="pct">000</div><button class="iskip"'), /boot: the ignition shows a loading counter/],
    ['the stale closing line back in chapter 04', inChapter('cL', (c) => c.replace('</section>', `<div class="lend copy2"><h3 class="head">${esc(P.espH2)}</h3></div></section>`)), /structure: chapter 04 closes on/],
    ['chapter 04 with a length the engine is not scaled for', html.replace('id="cL" style="--len:6.2"', 'id="cL" style="--len:6.4"'), /structure: chapter 04 is 6.4 screens/],
    ['no noindex', html.replace(/<meta name="robots"[^>]*>/, ''), /meta: no noindex/],
    ['a Meta Pixel', html.replace('</head>', '<script>fbq("init")</script></head>'), /meta: Meta Pixel/],
  ];
}
function selfTest(html, lang) {
  let bad = 0;
  const fail = (m) => { console.error(`FAIL self-test (${lang}): ${m}`); bad++; };
  if (judge(html, lang).length) return 0;                            // the real page is judged by the loop below, with its own messages
  for (const [what, page, expect] of mutants(html, lang)) {
    if (page === html) { fail(`the mutation "${what}" changed nothing`); continue; }
    const got = judge(page, lang);
    if (expect === null) { if (got.some((g) => g.startsWith('rules:'))) fail(`"${what}" must stay clean but the gate says: ${got.filter((g) => g.startsWith('rules:')).join(' | ')}`); }
    else if (!got.some((g) => expect.test(g))) fail(`the gate does not catch "${what}" (wanted ${expect}, got ${got.length ? got.join(' | ') : 'nothing'})`);
  }
  // the page's guard() throws on the same table, and only on what is banned
  const kc01 = modulos(lang)[0].kc, throwing = (s, o) => { try { guard('self-test', s, o); return false; } catch { return true; } };
  for (const [what, s] of [['city', 'Medellín'], ['courses', 'cursos'], ['cover', 'EBOOK'], ['§0.4', 'singularidad'], ['monthly', '/mes'], ['claim', 'veinte segundos'], ['cat', 'un gato'], ['testimonial', 'testimonios']])
    if (!throwing(s)) fail(`guard() does not throw on ${what} ("${s}")`);
  if (throwing('Cartagena es hermosa') || throwing('Cartagena is beautiful')) fail('guard() throws on the tokenizer example');
  if (!throwing(kc01)) fail('guard() accepts lesson 01\'s caption without the named exemption');
  if (throwing(kc01, { allow: [kc01] })) fail('guard() throws on lesson 01\'s caption even with the named exemption');
  if (throwing(STR[lang].pub.v3.s5H)) fail('guard() throws on the sanctioned testimonial sentence');
  // the page still reads everything through the guard
  const src = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8');
  if (!/guarded\(L\.pub,\s*'pub'\)/.test(src) || !/from '\.\.\/aegis\/copy-guard'/.test(src) || (src.match(/\bguard\(/g) ?? []).length < 4) fail('v3.astro no longer reads its strings through guarded() / guard()');
  return bad;
}
// A gate that cannot fail proves nothing: each way the Δ defect can come back must be caught by deltaRule.
function deltaSelfTest(html, lang) {
  const ctx = ctxOf(STR[lang].pub.land.bD), splits = tokenize(ctx).join(' ') !== ctx;
  const mut = {
    'candidate chip back in the Cartagena row': html.replace('<div class="chips ctx"', '<div class="tk ans"><b>Max</b></div><div class="chips ctx"'),
    'card context line removed': html.replace(/<p class="pctx">[\s\S]*?<\/p>/, ''),
    'candidate name typed into row A': html.replace('<div class="tk"><b>Carta</b></div>', '<div class="tk"><b>Max</b></div>'),
    'a context piece dropped': html.replace(/<div class="tk cw" data-w="\d+"><b>[^<]*<\/b><\/div>/, ''),
    ...(splits ? { 'context row cut into whole words (not by the tokenizer)': html.replace(/(<div class="chips ctx"[^>]*>)[\s\S]*?(<div class="tk ans">)/, (_m, a, c) => a + ctx.split(/\s+/).map((w, i) => `<div class="tk cw" data-w="${i}"><b>${w}</b></div>`).join('') + c) } : {}),
  };
  let bad = 0;
  if (deltaRule(html, lang).length) return 0;                      // the real page is judged by the loop below
  for (const [what, m] of Object.entries(mut)) if (m === html || !deltaRule(m, lang).length) { console.error(`FAIL self-test: deltaRule does not catch "${what}"`); bad++; }
  return bad;
}

// ---------- run ----------
const pages = new Map();
for (const lang of LANGS) for (const cc of MARKETS) {
  const tag = `${lang}/${cc ?? 'none'}`;
  try {
    const r = await fetch(`${BASE}/v3`, { headers: { cookie: `pref_lang=${lang}`, ...(cc ? { 'cf-ipcountry': cc } : {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    pages.set(tag, await r.text());
  } catch (e) { console.error(`FAIL ${tag}: cannot fetch ${BASE}/v3 (${e.message})`); process.exit(1); }
}
let fail = 0, mutantCount = 0;
for (const lang of LANGS) {
  const html = pages.get(`${lang}/none`);
  fail += selfTest(html, lang) + deltaSelfTest(html, lang);
  mutantCount += mutants(html, lang).length;
}
for (const lang of LANGS) for (const cc of MARKETS) {
  const tag = `${lang}/${cc ?? 'none'}`, html = pages.get(tag);
  for (const msg of judge(html, lang)) { console.error(`FAIL ${tag}: ${msg}`); fail++; }
  if (cc === null) {
    const nums = [...new Set((textOf(html).replace(/Cartagena (es hermosa|is beautiful)/g, '').match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => n.replace(/[.,]$/, '')))].filter((n) => !ALLOWED_NUM.has(n));
    console.log(`${lang}: NOTE numbers outside the allowed set: ${nums.join(' ') || '(none)'}`);
  }
}
console.log(`v3-copy-check: ${pages.size} renders checked (${LANGS.length} languages x ${MARKETS.length} markets), ${CHAPTERS.length} chapters, ${mutantCount} mutated pages proved the rules can fail`);
if (fail) { console.error(`v3-copy-check: ${fail} failure(s)`); process.exit(1); }
console.log('v3-copy-check: ok');
