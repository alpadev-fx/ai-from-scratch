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
//     twice, chapter 05 telling a lesson's title or description again (chapter 09's), a missing noindex, a Meta Pixel, and the Δ chapter's token rules
//     (next-token candidates only after specimen B's own context, which is cut by the specimen tokenizer, never by spaces).
// Before it judges the real pages it proves, on MUTATED copies of the page, that every one of these rules CAN fail (and that the
// two exemptions stay narrow). If the page cannot be fetched or a self-test cannot fail, the gate FAILS: it never skips.
import { readFileSync } from 'node:fs';
import { STR } from '../src/lib/i18n.ts';
import { PRECIO_VISUAL, PRECIO_TEXTO } from '../src/lib/price.ts';
import { preguntas, modulos, candidatos } from '../src/data/landing.ts';
import { ctxOf, tokenize } from '../src/aegis/specimens.ts';
import { SANCTIONED, guard, violations, assertPriced } from '../src/aegis/copy-guard.ts';

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

// A currency amount is a number touching a currency mark, on either side («$39.990», «39.990 COP», «COP 39.990», «US$10», «10 dólares»). The page may print
// exactly one: the published price (PRECIO_VISUAL, or its «N COP» form).
const AMOUNT = /(?:US\$|\$|\b(?:COP|USD|MXN|EUR)\b|€)\s?\d(?:[\d.,]*\d)?|\d(?:[\d.,]*\d)?\s?(?:\b(?:COP|USD|MXN|EUR)\b|€|\b(?:pesos|d[oó]lares?|dollars?)\b)/g;
// Prices and currencies the product has sold in before, in any notation and with or without a currency mark. scripts/check-price.mjs keeps the same list for the
// SOURCE (web/src, api/src); this gate reads what the page actually SHIPS. Add a row here and there when the price moves; never remove one.
const RETIRED = [[/\b35[.,]000\b(?![.,]\d)/, '35.000'], [/\b35000\b/, '35000'], [/\b39[.,]900\b/, '39.900'], [/\b39900\b/, '39900'], [/\b38[.,]899\b/, '38.899'], [/\b38899\b/, '38899'],
  [/\b99[.,]999\b/, '99.999'], [/\b175[.,]000\b/, '175.000'], [/\b9\.99\b/, '9.99'], [/\bUSD\b/, 'USD']];

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
    c05: [['label', lab('05', V.ch05)], ...mods.slice(0, 6).flatMap((m) => [[`fig ${m.n} eyebrow`, m.eb], [`fig ${m.n} number`, m.k], [`fig ${m.n} caption`, m.kc]])],
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

  // prices: every currency amount on the page is the published price, in the language's notation, and never a literal of ours; and no price the product
  // has sold at before is on the page at all, whatever its notation and whether or not a currency mark touches it (the readable text, the text-bearing
  // attributes and the JSON the page ships)
  const okPrice = new Set([big, `${PRECIO_TEXTO[lang]} COP`]);
  for (const m of new Set(corpus.match(AMOUNT) ?? [])) if (!okPrice.has(m)) f.push(`price: "${m}" is not the published price (${[...okPrice].join(' / ')})`);
  for (const [re, name] of RETIRED) { const hit = re.exec(corpus); if (hit) f.push(`price: the page names the retired price ${name} ("${corpus.slice(Math.max(0, hit.index - 25), hit.index + hit[0].length + 25)}")`); }
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

  // chapter 05 is the six figures and what they measure: eyebrow, number, caption, lesson number. Each lesson's title and description are chapter 09's,
  // said once (a second telling only lengthened the page), and the HUD label is the chapter's heading.
  const cards = [...ch.c05.html.matchAll(/<article class="fig" data-fig>\s*<p class="ie">[^<]*<\/p>\s*<p class="big [^"]*" data-cifra>[^<]*<\/p>\s*<p class="cap">[^<]*<\/p>\s*<span class="no">\d\d<\/span>\s*<\/article>/g)];
  if (cards.length !== 6) f.push(`structure: chapter 05 has ${cards.length} cards made of eyebrow + number + caption + lesson number, expected 6`);
  const t05 = copyOf(ch.c05.html);
  for (const m of modulos(lang).slice(0, 6)) for (const [what, s] of [['title', m.h], ['description', m.d]]) if (t05.includes(norm(s))) f.push(`structure: chapter 05 repeats lesson ${m.n}'s ${what} (chapter 09 says it)`);
  if (!/<h2 class="sn" id="c05n">/.test(ch.c05.html)) f.push('structure: chapter 05\'s HUD label is not its h2 (id c05n)');

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
    ['skipping on wheel', /'wheel'/], ['skipping on touch', /'touchstart'/], ['the 15 s watchdog', /\},15000\)/], ['manual scroll restoration', /history\.scrollRestoration\s*=\s*'manual'/]]) if (!re.test(bootJs)) f.push(`boot: the head script lost ${what}`);
  if (/class="pct"/.test(ch.ign.html)) f.push('boot: the ignition shows a loading counter that is not bound to anything real');
  // The watchdog gives up on the engine; it must not move anybody. It marks the visit (html.eng-off) and changes NO layout: removing fx / adding nogl
  // would reflow a reader who has been scrolling the page for 15 s (the chapters would change height under them).
  const wd = bootJs.match(/setTimeout\(function\(\)\{([\s\S]*?)\},15000\)/)?.[1];
  if (bootJs && wd !== undefined) {
    if (!/classList\.add\(\s*'eng-off'/.test(wd)) f.push('boot: the watchdog no longer marks the visit as engine-off (html.eng-off)');
    if (/classList\.remove\([^)]*'fx'/.test(wd) || /classList\.add\(\s*'nogl'/.test(wd)) f.push('boot: the watchdog changes the layout (removes fx or adds nogl): that moves a reader who has been scrolling for 15 s');
  }

  // layout: the page is only as tall as the engine it has. The tall scroll-driven chapters (html.fxl) are switched on by main.ts when it attaches the engine
  // at the top of the page; until then, and for the whole visit of anybody who scrolled first, the hero is ONE screen in its engine look and every other
  // chapter is the static one. The rendered CSS and markup prove the parts of that which live in the page (v3.css "ENGINE MODE", the `lay` class).
  const cssNc = css.replace(/\/\*[\s\S]*?\*\//g, ''), rules = [...cssNc.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const tall = rules.filter((r) => /calc\(var\(--len\)\s*\*\s*100svh\)/.test(r.body));
  if (!tall.length) f.push('layout: no rule gives a chapter its tall height (calc(var(--len) * 100svh))');
  for (const r of tall) if (!/\bhtml\.fxl\b/.test(r.sel)) f.push(`layout: the tall chapter height is keyed to "${r.sel}", not to html.fxl: the page would be tall (and its stage pinned) before any engine exists`);
  if (!rules.some((r) => r.sel === 'html.fx .lay' && /(^|;)\s*height:100svh\b/.test(r.body))) f.push('layout: the hero is not one screen before the engine attaches (expected html.fx .lay{height:100svh})');
  for (const r of rules) for (const sel of r.sel.split(',').map((x) => x.trim()))
    if (/\bhtml\.fx\b(?!l)/.test(sel) && /\.(?:stage|copy|head|chr|label|sub|chips|sent|tk|pcard|dial|steps(?:-wrap)?|s02)\b/.test(sel) && !/\.lay\b|#c01\b/.test(sel))
      f.push(`layout: "${sel}" lays chapters out under html.fx alone (use html.fxl, or .lay / #c01 for the hero's one-screen look)`);
  const secs = [...html.matchAll(/<section\b([^>]*)>/g)].map((m) => ({ id: /\bid="([^"]*)"/.exec(m[1])?.[1], cls: (/\bclass="([^"]*)"/.exec(m[1])?.[1] ?? '').split(/\s+/) }));
  if (!secs.some((x) => x.id === 'c01' && x.cls.includes('lay'))) f.push('layout: the hero lost its `lay` class in the markup: it would not be the one-screen engine look it paints at first');
  const stray = secs.filter((x) => x.id !== 'c01' && x.cls.includes('lay')).map((x) => `#${x.id}`);
  if (stray.length) f.push(`layout: ${stray.join(', ')} carries the engine's \`lay\` class in the markup: it gets it when the engine registers it, or it is pinned and one screen tall before any engine exists`);

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
  const sanct = esc(V.s5H.match(SANCTIONED)[0]), s3 = esc(V.s3H), stale = lang === 'es' ? '$35.000' : '35,000 COP';
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
    ['a retired price as a bare number (35.000)', poison(html, 'costaba 35.000'), /price: the page names the retired price 35\.000/],
    ['a retired price in the other notation (39,900)', poison(html, '39,900'), /price: the page names the retired price 39\.900/],
    ['a retired price in the JSON the page ships (38899)', html.replace(/(<script[^>]*application\/json[^>]*>)\{/, '$1{"x":"38899",'), /price: the page names the retired price 38899/],
    ['the published price in a notation of its own (COP 39.990)', poison(html, `COP ${PRECIO_TEXTO[lang]}`), /price: "COP [\d.,]+" is not the published price/],
    ['the hero paid label carrying a retired price', inChapter('c01', (c) => c.replace(`<span>${P.preCta}</span>`, `<span>${P.preCta.replace(big, stale)}</span>`)), /price: /],
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
    ['a chapter 05 card with its lesson title and description back', inChapter('c05', (c) => c.replace('<span class="no">01</span>', `<h3>${esc(modulos(lang)[0].h)}</h3><p class="fd">${esc(modulos(lang)[0].d)}</p><span class="no">01</span>`)), /structure: chapter 05 (repeats lesson 01's title|has 5 cards)/],
    ['a chapter 05 caption that quotes lesson 02\'s title', inChapter('c05', (c) => c.replace('<p class="cap">', `<p class="cap">${esc(modulos(lang)[1].h)} `)), /structure: chapter 05 repeats lesson 02's title/],
    ['the chapter 05 label back to a plain div', inChapter('c05', (c) => c.replace(/<h2 class="sn" id="c05n">([\s\S]*?)<\/h2>/, '<div class="sn" id="c05n">$1</div>')), /structure: chapter 05's HUD label is not its h2/],
    ['a retired price notation (pago único)', poison(html, 'Pago único de $39.990'), /rules: hormozi/],
    ['a CSS rule that hides the hero copy until ready', html.replace('</head>', '<style>html.fx:not(.ready) .stage .copy .head{opacity:0}</style></head>'), /boot: a CSS rule hides copy/],
    ['the hero h1 server-rendered hidden', html.replace('<h1 class="head"', '<h1 style="opacity:0" class="head"'), /boot: the hero copy is server-rendered hidden/],
    ['the ignition without its 1.2 s cap', html.replace('setTimeout(end,1200)', 'setTimeout(end,12000)'), /boot: the head script lost the 1200 ms cap/],
    ['the ignition that cannot be skipped by wheel', html.replace("'wheel'", "'wheelx'"), /boot: the head script lost skipping on wheel/],
    ['the head script without the watchdog', html.replace('},15000);', '},15000000);'), /boot: the head script lost the 15 s watchdog/],
    ['the head script without manual scroll restoration', html.replace("history.scrollRestoration='manual'", "history.scrollRestoration='auto'"), /boot: the head script lost manual scroll restoration/],
    ['a watchdog that takes the layout away again (fx off, nogl on)', html.replace("d.classList.remove('ign-on');d.classList.add('eng-off');", "d.classList.remove('fx','ign-on');d.classList.add('nogl');"), /boot: the watchdog (changes the layout|no longer marks)/],
    ['a watchdog that no longer marks the visit', html.replace("d.classList.add('eng-off');", ''), /boot: the watchdog no longer marks the visit/],
    ['the tall chapter height keyed to html.fx again', html.replace('html.fxl .lay{height:calc(var(--len) * 100svh)}', 'html.fx .lay{height:calc(var(--len) * 100svh)}'), /layout: the tall chapter height is keyed to "html\.fx \.lay"/],
    ['the tall chapter height gone', html.replace('html.fxl .lay{height:calc(var(--len) * 100svh)}', ''), /layout: no rule gives a chapter its tall height/],
    ['the hero not one screen before the engine', html.replace('html.fx .lay{height:100svh;', 'html.fx .lay{'), /layout: the hero is not one screen/],
    ['a stage rule keyed to html.fx alone again', html.replace('</head>', '<style>html.fx .stage{position:sticky}</style></head>'), /layout: "html\.fx \.stage" lays chapters out under html\.fx alone/],
    ['chapter 02 full-screen layout keyed to html.fx again', html.replace('html.fxl .s02{padding-top:max(110px', 'html.fx .s02{padding-top:max(110px'), /layout: "html\.fx \.s02" lays chapters out/],
    ['a chapter 04 engine rule keyed to html.fx again', html.replace('html.fxl .steps-wrap{', 'html.fx .steps-wrap{'), /layout: "html\.fx \.steps-wrap" lays chapters out/],
    ['the hero without its lay class', html.replace('<section class="ch lay" id="c01"', '<section class="ch" id="c01"'), /layout: the hero lost its `lay` class/],
    ['chapter 04 with the lay class in the markup', html.replace('<section class="ch" id="cL"', '<section class="ch lay" id="cL"'), /layout: #cL carries the engine's `lay` class/],
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
  // the page throws on a paid label whose literal price is not the published one, and only then
  const Pl = STR[lang].pub.land, bigP = PRECIO_VISUAL[lang], other = PRECIO_VISUAL[lang === 'es' ? 'en' : 'es'];
  const priced = (label) => { try { assertPriced('self-test', label, bigP); return false; } catch { return true; } };
  if (priced(Pl.preCta) || priced(Pl.cierreCta)) fail('assertPriced throws on a paid label that carries the published price');
  for (const [what, label] of [['a retired price', Pl.preCta.replace(bigP, lang === 'es' ? '$35.000' : '35,000 COP')], ['no price at all', Pl.cierreCta.replace(bigP, '').trim()], ["the other language's notation", Pl.preCta.replace(bigP, other)]])
    if (!priced(label)) fail(`assertPriced accepts a paid label with ${what} ("${label}")`);
  // the page still reads everything through the guard
  const src = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8');
  if (!/guarded\(L\.pub,\s*'pub'\)/.test(src) || !/from '\.\.\/aegis\/copy-guard'/.test(src) || (src.match(/\bguard\(/g) ?? []).length < 4) fail('v3.astro no longer reads its strings through guarded() / guard()');
  if (!/assertPriced\('pub\.land\.preCta', P\.preCta, precioBig\)/.test(src) || !/assertPriced\('pub\.land\.cierreCta', P\.cierreCta, precioBig\)/.test(src)) fail('v3.astro no longer checks its two paid labels against the published price');
  if (/PRECIO_VISUAL\[lang\]\s*\?\?/.test(src)) fail("v3.astro falls back to another language's price notation");
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

// ---------- the engine's boot (src/aegis/main.ts) ----------
// The page rules above read the rendered page. The other half of the layout contract lives in main.ts: it is the only place that switches the tall layout on,
// only at the very top of the page, and when anything stops the engine it leaves the layout alone. Removing fx or adding nogl there (or scrolling the page to the
// top) would reflow a reader who is already moving through the chapters, which is the jump this exists to prevent.
function engineBoot(src) {
  const f = [];
  if (!/classList\.add\('fxl'\)/.test(src)) f.push('it no longer switches the tall layout on (html.fxl)');
  if (!/scrollY\s*<=\s*0/.test(src)) f.push('it no longer attaches only at the very top of the page (scrollY <= 0)');
  if (!/classList\.add\('eng-off'\)/.test(src)) f.push('it no longer marks a visit that has no engine (html.eng-off)');
  if (/classList\.remove\([^)]*'fx'/.test(src) || /classList\.add\(\s*'nogl'/.test(src)) f.push('it takes the layout away from the page (removes fx or adds nogl): that reflows a reader who is already scrolling');
  if (/\bscrollTo\(\s*0\s*,\s*0\s*\)/.test(src)) f.push('it scrolls the page to the top when it boots: that yanks a reader who has already moved');
  return f;
}
function engineBootSelfTest(src) {
  if (engineBoot(src).length) return [0, 0];                       // the real file is judged by the run below
  let bad = 0;
  const cases = [
    ['no html.fxl switch', src.replace("classList.add('fxl')", "classList.add('fxl-x')"), /switches the tall layout on/],
    ['no scroll guard', src.replace('scrollY <= 0', 'true'), /only at the very top/],
    ['no eng-off marker', src.replaceAll("classList.add('eng-off')", "classList.add('off-x')"), /marks a visit that has no engine/],
    ['fx taken off when the engine fails', src.replace("release(); markOff('error');", "release(); de.classList.remove('fx', 'gl-on'); markOff('error');"), /takes the layout away/],
    ['nogl put on when the engine fails', src.replace("release(); markOff('error');", "release(); de.classList.add('nogl'); markOff('error');"), /takes the layout away/],
    ['a scrollTo(0, 0) at boot', src.replace('if (!A.fx) return;', 'if (!A.fx) return; scrollTo(0, 0);'), /scrolls the page to the top/],
  ];
  for (const [what, m, expect] of cases) { const got = engineBoot(m); if (m === src || !got.some((g) => expect.test(g))) { console.error(`FAIL self-test: engineBoot does not catch "${what}" (got ${got.join(' | ') || 'nothing'})`); bad++; } }
  return [bad, cases.length];
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
const mainSrc = readFileSync(new URL('../src/aegis/main.ts', import.meta.url), 'utf8');
{ const [bad, n] = engineBootSelfTest(mainSrc); fail += bad; mutantCount += n; }
for (const m of engineBoot(mainSrc)) { console.error(`FAIL main.ts: ${m}`); fail++; }
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
