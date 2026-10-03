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
//   · stage 2B (the chapters' motion): the hooks each effect drives are in the server-rendered markup, the effects' CSS hangs on html.fxl and on attributes
//     the armed effect itself sets (never a default that hides copy), and the effect modules (src/aegis/fx) write no copy, animate only transform, opacity,
//     clip-path and filter, pre-arm only what is below the fold, and are built after html.fxl and undone with it (main.ts).
// Before it judges the real pages it proves, on MUTATED copies of the page, that every one of these rules CAN fail (and that the
// two exemptions stay narrow). If the page cannot be fetched or a self-test cannot fail, the gate FAILS: it never skips.
import { existsSync, readFileSync } from 'node:fs';
import { STR } from '../src/lib/i18n.ts';
import { PRECIO_VISUAL, PRECIO_TEXTO } from '../src/lib/price.ts';
import { preguntas, modulos, candidatos } from '../src/data/landing.ts';
import { ctxOf } from '../src/aegis/specimens.ts';
import { piecesOf, show, wordsOf } from '../src/aegis/tokens.ts';
import { chipStrings } from '../src/aegis/token-strings.ts';
import { SANCTIONED, guard, violations, assertPriced } from '../src/aegis/copy-guard.ts';

// The committed real tokens (o200k_base, cut with tiktoken by web/scripts/v3-tokens.py): every chip on the page must be one of these pieces.
const TOKEN_FILE = JSON.parse(readFileSync(new URL('../src/data/v3-tokens.json', import.meta.url), 'utf8'));
const chipSources = (lang) => ({ P: STR[lang].pub.land, V: STR[lang].pub.v3, mods: modulos(lang), price: PRECIO_VISUAL[lang], ctx: ctxOf(STR[lang].pub.land.bD), cands: candidatos(lang) });

const BASE = process.env.BASE ?? 'http://127.0.0.1:4321';
// The narrative changes with the visitor's market, so every market is fetched: a city that only shows for one market is the
// failure this gate exists for.
const MARKETS = [null, 'CO', 'US', 'MX', 'ES', 'JP'];
const LANGS = ['es', 'en'];
// 00 ignition (the overlay) · 01 hero · 02 te ha pasado · 03 qué cambia · 04 por dentro (Δ, id cL) · 05 cifras · 06 lo que no
// necesitas · 07 el tiempo · 08 prueba · 09 temario · 10 la oferta · 11 garantía · 12 quién · 13 para quién · 14 precio · 15 FAQ · 16 cierre
const CHAPTERS = ['ign', 'c01', 'c02', 'c03', 'cL', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16'];
const LEGACY = ['especimenes', 'indice', 'ventajas', 'quien', 'vivo', 'precio', 'faq'];
// What each chapter's SERVER-RENDERED markup must carry for its stage-2B effect: the data-fx name and the hooks the effect reads, with how many of each. A hook that
// goes missing makes its effect throw at attach (the chapter stays static, with a console warning): this catches it before it ships.
const FX_HOOKS = {
  c02: { fx: 'chat-stream', hooks: [['data-chat', 1], ['data-beat', 3], ['data-win', 3], ['data-type', 3], ['data-tag', 3], ['data-ctx', 1]] },
  c03: { fx: 'sharpen', hooks: [['data-sharp', 1], ['data-prompt', 1], ['data-slot', 3], ['data-bar', 10], ['data-flat', 10]] },
  c05: { fx: 'track', hooks: [['data-track', 1], ['data-fig', 6], ['data-cifra', 6]], stage: true },
  c06: { fx: 'implode', hooks: [['data-nots', 1], ['data-word', 6], ['data-final', 1]], stage: true },
  c07: { fx: 'ring', hooks: [['data-ring', 1], ['data-ring-stroke', 1], ['data-tick', 12], ['data-count', 1]] },   // one counter only: the four figures under the ring never count
  c08: { fx: 'bars-once', hooks: [['data-bars', 1]] },
};
// the parts that exist only because an effect added them (they must hang on html.fxl) · the selectors that name the copy of an effect chapter · what hides it
const FX_ONLY = /\.(?:ty|gh|pin|rail|imp|pen|num|wrs?)\b|\[data-fx-/;
const FX_COPY = /\.(?:rp|tag|you|ia|who|shout|bt|beat|chat|trio|tri|figs|fig|big|cap|ie|nots|hx|ctr|specs|srow|tcopy|lede|clock)\b|cb|cn|cp|crow|cands|spec|\bs\[data-word\]|\bdt\b|\bdd\b|#c(?:0[2-9]|1[0-6])\b/;
const FX_HIDES = /(?:^|;)\s*(?:opacity\s*:\s*0(?![.\d])|visibility\s*:\s*hidden|display\s*:\s*none|clip-path\s*:|color\s*:\s*transparent|font-size\s*:\s*0\b|transform\s*:\s*scale\(0\b)/;
const CTA_CHAPTERS = ['c03', 'c07', 'c10', 'c11'];       // CTA rows with the price label + the guarantee line; c14 has its in-card button; c16 closes
const ALLOWED_NUM = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '23', '24', '30', '31', '36', '40', '94', '100', '100.000', '100,000',
  '39.990', '39,990', '70.000.000.000', '70,000,000,000', '18,615', '0.30', '0', '000', '1.1', '18', '20', '70', '83', '200',    // 200: «o200k», the vocabulary's own name in the chips' source label
  ...Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0'))]);

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
    c03: [['label', lab('03', V.ch03)], ['h2', P.llevasH2], ['chips source', V.tokReal], ...V.askSlots.map((w) => ['slot', w]), ['bars say what they are', V.tabNext], ['drawing label', V.ilus],
      ['l1', P.l1H], ['l1', P.l1D], ['l2', P.l2H], ['l2', P.l2D], ['l3', P.l3H], ['l3', P.l3D], ...cta],
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
  const out = [], ctx = ctxOf(STR[lang].pub.land.bD), names = candidatos(lang).map((c) => c.name), P = STR[lang].pub.land, V = STR[lang].pub.v3;
  const sec = (html.match(/<section class="ch" id="cL"[\s\S]*?<\/section>/) ?? [''])[0];
  const iA = sec.indexOf('<div class="chips"'), iB = sec.indexOf('<div class="chips ctx"');
  if (!sec || iA < 0 || iB < iA) return ['chapter or its two chip rows missing / out of order'];
  const rowA = sec.slice(iA, iB), rowB = sec.slice(iB, sec.indexOf('<aside', iB));
  // the chips are REAL tokens (o200k_base): row A is the cut of the example sentence, row B the cut of the dog context, piece for piece, a leading space shown as «·»
  const realA = piecesOf(TOKEN_FILE[lang], P.aEjemplo), realB = piecesOf(TOKEN_FILE[lang], ctx);
  const gotA = [...rowA.matchAll(/<div class="tk"><b>([^<]*)<\/b><\/div>/g)].map((m) => decode(m[1]));
  if (gotA.join('|') !== realA.map((p) => show(p[0])).join('|')) out.push(`the Cartagena row is [${gotA.join(' | ')}], expected the real tokens [${realA.map((p) => show(p[0])).join(' | ')}]`);
  if (((rowA.match(/class="tk"/g) ?? []).length) !== gotA.length) out.push('a Cartagena chip has an unexpected shape');
  if (/class="[^"]*\bans\b[^"]*"/.test(rowA)) out.push('a candidate chip (.ans) is inside the Cartagena row');
  const textA = norm(rowA.replace(/<[^>]+>/g, ' '));
  for (const n of names) if (textA.includes(n)) out.push(`candidate name "${n}" is in the Cartagena row`);
  const chips = [...rowB.matchAll(/<div class="tk cw" data-w="(\d+)"><b>([^<]*)<\/b><\/div>/g)].map((m) => ({ w: +m[1], t: decode(m[2]) }));
  if (chips.map((c) => c.t).join('|') !== realB.map((p) => show(p[0])).join('|')) out.push(`context row chips are [${chips.map((c) => c.t).join(' | ')}], expected the real tokens [${realB.map((p) => show(p[0])).join(' | ')}]`);
  if (chips.map((c) => c.w).join() !== wordsOf(realB).join()) out.push(`context chips carry the word indexes [${chips.map((c) => c.w)}], expected [${wordsOf(realB)}]`);
  if (((rowB.match(/class="tk cw"/g) ?? []).length) !== chips.length) out.push('a context chip has no data-w word index');
  const ans = (html.match(/class="tk ans"/g) ?? []).length;
  if (ans !== 1) out.push(`${ans} candidate chips on the page, expected exactly 1 (after the context row)`);
  else if (html.indexOf('class="tk ans"') < html.indexOf('<div class="chips ctx"')) out.push('the candidate chip comes before the context row');
  // the predicted chip is the next token of the vocabulary after the context: the first piece of «<space>Name», its leading space shown as «·» like every chip of the row («·Max», not «Max»)
  if (ans === 1) {
    const gotAns = html.match(/<div class="tk ans"><b>([^<]*)<\/b><\/div>/)?.[1], wantAns = show(piecesOf(TOKEN_FILE[lang], ' ' + candidatos(lang)[0].name)[0][0]);
    if (gotAns === undefined || decode(gotAns) !== wantAns) out.push(`the predicted chip is «${gotAns === undefined ? '(unreadable)' : decode(gotAns)}», expected «${wantAns}» (the first real token after the context, its leading space marked)`);
  }
  const pc = sec.match(/<p class="pctx">([\s\S]*?)<\/p>/);
  if (!pc || norm(pc[1]) !== norm(ctx)) out.push(`the card context line is "${pc ? norm(pc[1]) : '(missing)'}", expected "${ctx}"`);
  // the factual source of the chips, once, under row A (NUEVO, pending the owner's approval: pub.v3.tokReal)
  const refs = [...sec.matchAll(/<p class="tokref">([\s\S]*?)<\/p>/g)].map((m) => norm(m[1]));
  if (refs.length !== 1 || refs[0] !== norm(V.tokReal)) out.push(`the source label of the chips is [${refs.join(' | ')}], expected exactly one «${V.tokReal}»`);
  else if (sec.indexOf('<p class="tokref">') < iA || sec.indexOf('<p class="tokref">') > iB) out.push('the source label is not between the two chip rows');
  return out;
}

// ---------- chapter 02: a chat's look in our frame, and nothing of anyone else's ----------
// The owner's brief: the windows look like a chat (the user's message in a soft grey pill on the right, the answer as plain text on the left with no avatar, a composer with a caret and an
// arrow-up send button at the bottom) but they carry OUR mark where a chat shows its name, never another product's: no logo, no name («ChatGPT», «OpenAI», «GPT-»), no model picker, no
// disclaimer, no copied placeholder, no avatar next to the answer, no visible YOU / AI labels (they exist for a screen reader only). The diagnosis tag is OUTSIDE its window and links its lesson.
const MARKS = /chatgpt|openai|gpt-|can make mistakes|check important info|puede cometer errores|ask anything|pregunta lo que quieras|pregunta cualquier cosa|model picker/i;
function chatRule(html, lang) {
  const out = [], V = STR[lang].pub.v3;
  const c02 = (html.match(/<section id="c02"[\s\S]*?<\/section>/) ?? [''])[0];
  if (!c02) return ['chapter 02 is missing'];
  const mark = c02.match(MARKS);
  if (mark) out.push(`chapter 02 carries another product's mark or text («${mark[0]}»): a chat's look with our name only`);
  const wins = [...c02.matchAll(/<figure class="cw" data-win>([\s\S]*?)<\/figure>/g)].map((m) => m[1]);
  if (wins.length !== 3) out.push(`chapter 02 has ${wins.length} chat windows, expected 3 (one per case)`);
  wins.forEach((w, i) => {
    if (!/<div class="cwh" aria-hidden="true"><span class="lg">IA<\/span><\/div>/.test(w)) out.push(`window ${i + 1} does not carry the site's own mark (the square IA) in its header`);
    if (!/<div class="cwc" aria-hidden="true"><i class="caret"><\/i><b class="send"><svg[\s\S]*?<\/svg><\/b><\/div>/.test(w)) out.push(`window ${i + 1} has no composer with a caret and a send button`);
    if (/<img\b|<picture\b|<canvas\b|\bavatar\b|class="av\b/i.test(w)) out.push(`window ${i + 1} has an avatar or an image: the answer is plain text with no avatar`);
    if (/\bdata-tag\b/.test(w)) out.push(`window ${i + 1} holds its diagnosis tag: the tag sits OUTSIDE the window, under it`);
    if (/class="who"/.test(w) || !/<p class="you[^"]*"><span class="sr">/.test(w) || !/<p class="ia"><span class="sr">/.test(w)) out.push(`window ${i + 1}: the YOU / AI labels must be screen-reader-only spans (class sr), never visible`);
  });
  const sr = (t) => (c02.match(new RegExp(`<span class="sr">${t}</span>`, 'g')) ?? []).length;
  if (sr(V.chatTu) !== 4 || sr(V.chatIa) !== 3) out.push(`the screen-reader labels are ${sr(V.chatTu)} «${V.chatTu}» and ${sr(V.chatIa)} «${V.chatIa}», expected 4 and 3 (a pill each, the first instruction of window 2, an answer each)`);
  const tags = [...c02.matchAll(/<\/figure>\s*<p class="tag" data-tag>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  if (tags.length !== 3) out.push(`chapter 02 has ${tags.length} diagnosis tags right after a window, expected 3`);
  tags.forEach((t, i) => { if (!/<a href="#c09">(?:LECCI[ÓO]N|LESSON) \d\d<\/a>/.test(t)) out.push(`tag ${i + 1} has no link to its lesson in the syllabus (#c09)`); });
  return out;
}
// A gate that cannot fail proves nothing: each way the chat can turn into somebody else's, or lose what the owner asked for, must be caught by chatRule.
function chatSelfTest(html, lang) {
  if (chatRule(html, lang).length) return [0, 0];                   // the real page is judged by the loop below
  const inC02 = (fn) => { const at = html.indexOf('<section id="c02"'), end = html.indexOf('</section>', at); return html.slice(0, at) + fn(html.slice(at, end)) + html.slice(end); };
  const mut = {
    'the text «ChatGPT» in chapter 02': inC02((c) => c.replace('<div class="cwh" aria-hidden="true">', '<div class="cwh" aria-hidden="true"><span>ChatGPT</span>')),
    'the text «OpenAI» in an attribute of chapter 02': inC02((c) => c.replace('<figure class="cw" data-win>', '<figure class="cw" data-win aria-label="OpenAI">')),
    'a model name («GPT-4o») in chapter 02': inC02((c) => c.replace('<p class="gap">', '<p class="gap">GPT-4o ')),
    'the disclaimer of another product in chapter 02': inC02((c) => c.replace('</figure>', '<p>ChatGPT can make mistakes. Check important info.</p></figure>')),
    'a copied placeholder in the composer': inC02((c) => c.replace('<i class="caret"></i>', '<i class="caret"></i><span>Ask anything</span>')),
    'an avatar image next to the answer': inC02((c) => c.replace('<p class="ia">', '<p class="ia"><img src="/x.png" alt="">')),
    'a visible YOU label (not screen-reader-only)': inC02((c) => c.replace('<span class="sr">', '<span class="who">')),
    'a window without the site\'s mark': inC02((c) => c.replace('<span class="lg">IA</span>', '<span class="lg"></span>')),
    'a window without its composer': inC02((c) => c.replace(/<div class="cwc" aria-hidden="true">[\s\S]*?<\/svg><\/b><\/div>/, '')),
    'the diagnosis tag inside its window': inC02((c) => c.replace('</figure> <p class="tag" data-tag>', '<p class="tag" data-tag>').replace('</p> </div><div class="case" data-beat="1">', '</p></figure> </div><div class="case" data-beat="1">')),
    'a tag without its lesson link': inC02((c) => c.replace(/<a href="#c09">/, '<a href="/login">')),
    'a fourth chat window': inC02((c) => c.replace('<p class="shout">', '<figure class="cw" data-win></figure><p class="shout">')),
  };
  let bad = 0;
  for (const [what, m] of Object.entries(mut)) if (m === html || !chatRule(m, lang).length) { console.error(`FAIL self-test: chatRule does not catch "${what}"`); bad++; }
  return [bad, Object.keys(mut).length];
}

// ---------- chapter 03: a drawing of the process, in real tokens, square, honest ----------
// The owner's brief: no circular footage lenses and no gears shot (they are gone), ONE display headline per chapter (the three benefits are mono labels), no round shape anywhere in the
// chapter, and a process that is real or labelled ILUSTRATIVO. The panel draws chapter 02's third case again: its request as the real o200k tokens it is, the three things that case's tag says
// it lacked as accent chips, and the distribution over the next word going from flat to one winner (a drawing: it says ILUSTRATIVO).
const C03_CSS = /(?:^|[\s,>+~])(?:\.sharp|\.spl|\.spr|\.sq|\.sl|\.sk|\.src|\.ilt|\.sb|\.bw|\.trio|\.tri)(?![\w-])/;
function sharpRule(html, lang) {
  const out = [], V = STR[lang].pub.v3;
  const c03 = (html.match(/<section id="c03"[\s\S]*?<\/section>/) ?? [''])[0];
  if (!c03) return ['chapter 03 is missing'];
  if (/<canvas\b|<img\b|<picture\b|<video\b|\bdata-lens\b|\/v3\/lens\//i.test(c03)) out.push('chapter 03 carries footage (a canvas, an image, a video or a lens pack): the circular lenses are gone, the chapter is a drawing');
  const hx = (c03.match(/class="hx[\s"]/g) ?? []).length;
  if (hx !== 1) out.push(`chapter 03 has ${hx} display headlines, expected exactly 1 (the three benefits are mono labels)`);
  if ((c03.match(/<h3>/g) ?? []).length !== 3 || (c03.match(/<article class="tri">/g) ?? []).length !== 3) out.push('chapter 03 does not have its three benefit plates (<article class="tri"> with an <h3> label each)');
  const panels = c03.match(/<figure class="sharp" data-sharp aria-hidden="true">[\s\S]*?<\/figure>/g) ?? [];
  if (panels.length !== 1) return [...out, `chapter 03 has ${panels.length} aria-hidden drawing panels, expected 1`];
  const pn = panels[0], tu = V.s1Beats[2].tu;
  // the request: the real tokens of case 3's pill, piece for piece (a leading space shown as «·»)
  const want = piecesOf(TOKEN_FILE[lang], tu).map((p) => show(p[0]));
  const row = pn.match(/<div class="sq" data-prompt>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const got = [...row.matchAll(/<span class="sk">([^<]*)<\/span>/g)].map((m) => decode(m[1]));
  if (got.join('|') !== want.join('|')) out.push(`the request row is [${got.join(' | ')}], expected the real tokens of «${tu}»: [${want.join(' | ')}]`);
  if ((row.match(/<span class="sk">/g) ?? []).length !== got.length) out.push('a request chip has an unexpected shape');
  // what it lacked: the words case 3's own tag names, in the order it names them
  const slots = [...pn.matchAll(/<span class="sk ask" data-slot>([^<]*)<\/span>/g)].map((m) => decode(m[1]));
  if (slots.join('|') !== V.askSlots.join('|')) out.push(`the context chips are [${slots.join(' | ')}], expected [${V.askSlots.join(' | ')}]`);
  const tag = V.s1Beats[2].tag; let at = 0;
  for (const w of slots) { const k = tag.indexOf(w, at); if (k < 0) { out.push(`the context chip «${w}» is not, in order, in the tag of chapter 02's third case («${tag}»): the three things the chapter adds are the ones that case says were missing`); break; } at = k + w.length; }
  // the factual source of the request's chips between the request and the three chips; the drawing says ILUSTRATIVO
  const src = [...pn.matchAll(/<p class="src">([\s\S]*?)<\/p>/g)].map((m) => norm(m[1]));
  if (src.length !== 1 || src[0] !== norm(V.tokReal)) out.push(`the source label of the request chips is [${src.join(' | ')}], expected exactly one «${V.tokReal}»`);
  else if (!(pn.indexOf('class="sq"') < pn.indexOf('class="src"') && pn.indexOf('class="src"') < pn.indexOf('class="sl"'))) out.push('the source label is not between the request chips and the context chips');
  // the bars say what they are (the options for the next token: the same term chapter 04 uses, V.tabNext) and that they are a drawing (ILUSTRATIVO)
  const ilt = [...pn.matchAll(/<p class="ilt"><i class="dot"><\/i><em>([^<]*)<\/em><\/p>/g)].map((m) => norm(decode(m[1])));
  if (ilt.length !== 1 || ilt[0] !== `${V.tabNext} · ${V.ilus}`) out.push(`the bars are labelled [${ilt.join(' | ')}], expected exactly one «${V.tabNext} · ${V.ilus}»`);
  if (/\bclass="flat"|--u:/.test(pn)) out.push('the dashed uniform line is back: an unexplained line in a drawing that has no legend');
  // the distribution: ten bars on one scale, the first the winner (and the only accent one), a clear winner, a flat start (every word about as likely), both of the same mass
  const bars = [...pn.matchAll(/<i\b([^>]*\bdata-bar="([^"]*)"[^>]*)>/g)].map((m) => ({ attrs: m[1], v: +m[2], f: +(/\bdata-flat="([^"]*)"/.exec(m[1])?.[1] ?? NaN), css: +(/style="--v:([\d.]+)"/.exec(m[1])?.[1] ?? NaN) }));
  if (bars.length !== 10) out.push(`the drawing has ${bars.length} bars, expected 10`);
  else {
    if (bars.some((b) => !(b.v > 0 && b.v <= 1) || !(b.f > 0 && b.f <= 1) || b.css !== b.v)) out.push('a bar lacks its final height (data-bar, the same as its --v) or its flat height (data-flat), both between 0 and 1');
    else {
      const vs = bars.map((b) => b.v), fs = bars.map((b) => b.f);
      if (vs[0] !== 1 || vs.slice(1).some((x, k) => !(x < vs[k]))) out.push(`the bars are [${vs}]: the first must be the winner (1) and each one after it lower`);
      if (vs[1] > 0.5) out.push(`the runner-up is ${vs[1]} of the winner: a sharp picture has a clear winner (at most half)`);
      if (Math.max(...fs) / Math.min(...fs) > 1.2) out.push(`the flat start is [${fs}]: every word must be about as likely (the tallest at most 1.2 times the shortest)`);
      const sv = vs.reduce((x, y) => x + y, 0), sf = fs.reduce((x, y) => x + y, 0);
      if (Math.abs(sv - sf) > 0.02) out.push(`the sharp bars add up to ${sv.toFixed(3)} and the flat ones to ${sf.toFixed(3)}: both are the same distribution on the same scale, they must weigh the same`);
    }
    const hi = (pn.match(/<i class="hi"/g) ?? []).length;
    if (hi !== 1 || !/<i class="hi" data-bar="1"/.test(pn)) out.push('the winner (the first bar) is not the only accent bar');
  }
  return out;
}
// A gate that cannot fail proves nothing: each way the chapter can go back to footage and rounded shapes, or lose what the owner asked for, must be caught.
function sharpSelfTest(html, lang) {
  if (sharpRule(html, lang).length) return [0, 0];                  // the real page is judged by the loop below
  const inC03 = (fn) => { const at = html.indexOf('<section id="c03"'), end = html.indexOf('</section>', at); return html.slice(0, at) + fn(html.slice(at, end)) + html.slice(end); };
  const V = STR[lang].pub.v3, first = piecesOf(TOKEN_FILE[lang], V.s1Beats[2].tu)[1][0];
  const mut = {
    'a lens pack named again': inC03((c) => c.replace('<article class="tri">', '<article class="tri" data-lens="v1">')),
    'a canvas of footage back in the chapter': inC03((c) => c.replace('<figure class="sharp"', '<canvas></canvas><figure class="sharp"')),
    'a second display headline': inC03((c) => c.replace('<article class="tri">', '<h2 class="hx">x</h2><article class="tri">')),
    'a benefit plate gone': inC03((c) => c.replace(/<article class="tri">[\s\S]*?<\/article>/, '')),
    'the drawing readable by a screen reader': inC03((c) => c.replace('data-sharp aria-hidden="true"', 'data-sharp')),
    'a request chip that is not a token': inC03((c) => c.replace(`<span class="sk">${esc(show(first))}</span>`, '<span class="sk">xx</span>')),
    'a request chip gone': inC03((c) => c.replace(/<span class="sk">[^<]*<\/span>/, '')),
    'the context chips reordered': inC03((c) => c.replace(`>${esc(V.askSlots[0])}</span>`, '>__</span>').replace(`>${esc(V.askSlots[1])}</span>`, `>${esc(V.askSlots[0])}</span>`).replace('>__</span>', `>${esc(V.askSlots[1])}</span>`)),
    'a context chip that case 3 never named': inC03((c) => c.replace(`>${esc(V.askSlots[2])}</span>`, '>CUÁNDO</span>')),
    'the source label gone': inC03((c) => c.replace(/<p class="src">[\s\S]*?<\/p>/, '')),
    'the ILUSTRATIVO label gone': inC03((c) => c.replace(/<p class="ilt">[\s\S]*?<\/p>/, '')),
    'a ninth bar': inC03((c) => c.replace(/<span class="bw"><i data-bar="[^"]*" data-flat="[^"]*" style="[^"]*"><\/i><\/span>/, '')),
    'a bar whose CSS height is not its data-bar': inC03((c) => c.replace(/style="--v:([\d.]+)"/, 'style="--v:.5"')),
    'a winner that is not clear': inC03((c) => c.replace(/(<span class="bw"><i data-bar=")[^"]*(")/, '$10.8$2').replace(/style="--v:0\.\d+"/, 'style="--v:0.8"')),
    'a flat start that is not flat': inC03((c) => c.replace(/data-flat="[^"]*"/, 'data-flat="0.9"')),
    'a second accent bar': inC03((c) => c.replace('<span class="bw"><i data-bar', '<span class="bw"><i class="hi" data-bar')),
    'the bars labelled only ILUSTRATIVO (nothing says what they are)': inC03((c) => c.replace(`${esc(V.tabNext)} · `, '')),
    'the bars labelled only with what they are (no ILUSTRATIVO)': inC03((c) => c.replace(` · ${esc(V.ilus)}`, '')),
    'the dashed uniform line back': inC03((c) => c.replace('<div class="sb">', '<div class="sb" style="--u:.2"><i class="flat"></i>')),
  };
  const css = {
    'a round chip (border-radius on .sk)': html.replace('.sk{display:inline-flex', '.sk{border-radius:50%;display:inline-flex'),
    'a round bar (border-radius on .bw i)': html.replace('.bw i{display:block', '.bw i{border-radius:4px;display:block'),
    'a circular clip on the panel': html.replace('.sharp{position:relative', '.sharp{clip-path:circle(50%);position:relative'),
    'a rounded benefit plate': html.replace('.tri{display:grid', '.tri{border-radius:12px;display:grid'),
  };
  let bad = 0;
  for (const [what, m] of Object.entries(mut)) if (m === html || !sharpRule(m, lang).length) { console.error(`FAIL self-test: sharpRule does not catch "${what}"`); bad++; }
  for (const [what, m] of Object.entries(css)) if (m === html || !judge(m, lang).some((x) => /^round: /.test(x))) { console.error(`FAIL self-test: the round-shape rule does not catch "${what}"`); bad++; }
  return [bad, Object.keys(mut).length + Object.keys(css).length];
}

// ---------- real tokens: what the page ships for the effects (#v3-tokens) ----------
// Every string that is a chip must be in the committed file (the page answers 500 otherwise), the page must ship exactly the pieces of that file, those pieces must join back into
// the strings, and every one of those strings must be on the page: a copy change with a stale file, or a file edited by hand into something that is not a cut, is red here and in
// web/test/v3-guard.test.mts. The ILUSTRATIVO tag stays on the free-typing specimen, the only heuristic cut left.
function tokensRule(html, lang) {
  const out = [], V = STR[lang].pub.v3;
  const m = html.match(/<script type="application\/json" id="v3-tokens"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
  if (m.length !== 1) return [`the page ships ${m.length} #v3-tokens blocks, expected 1`];
  let shipped; try { shipped = JSON.parse(m[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')); } catch (e) { return [`#v3-tokens is not JSON (${e.message})`]; }
  const want = chipStrings(chipSources(lang)), texts = [...new Set(want.map((c) => c.text))], text = textOf(html);
  const keys = Object.keys(shipped);
  for (const t of texts) if (!(t in shipped)) out.push(`#v3-tokens has no entry for «${t.slice(0, 40)}»`);
  for (const k of keys) if (!texts.includes(k)) out.push(`#v3-tokens has an entry that is not a chip string: «${k.slice(0, 40)}»`);
  for (const t of texts) if (t in shipped) {
    const p = shipped[t];
    if (!Array.isArray(p) || !p.length || p.map((x) => x[0]).join('') !== t) out.push(`the pieces of «${t.slice(0, 40)}» do not join back into it`);
    else if (JSON.stringify(p) !== JSON.stringify(TOKEN_FILE[lang][t])) out.push(`the pieces of «${t.slice(0, 40)}» are not the ones in v3-tokens.json`);
    if (!text.includes(norm(t))) out.push(`the chip string «${t.slice(0, 40)}» is not on the page (a stale token file)`);
  }
  // specimen A of chapter 08 (the free-typing box) is the one illustrative cut left, and says so right above its chips
  const c08 = (html.match(/<section id="c08"[\s\S]*?<\/section>/) ?? [''])[0];
  if (!new RegExp(`<div class="ph">${V.ilus}</div>\\s*<div id="tokens"`).test(c08)) out.push(`chapter 08's free-typing specimen does not carry its «${V.ilus}» tag right above its chips`);
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
  const v3css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).find((c) => c.includes('STAGE 2B · chapter effects')) ?? '';   // the page's own stylesheet (the theme tokens are another block)
  if (/\/\*(?!!)/.test(v3css)) f.push('weight: the inline stylesheet ships its source comments again (v3.astro strips every /* comment but a /*! one: about 9 KB on the wire, on the way to the first paint)');
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
  const strayPin = secs.filter((x) => x.cls.includes('pin')).map((x) => `#${x.id}`);
  if (strayPin.length) f.push(`layout: ${strayPin.join(', ')} carries the effects' \`pin\` class in the markup: an effect adds it when the engine attaches, or the chapter is tall and pinned before any engine exists`);

  // stage 2B: the hooks the effects drive are in the markup the server renders, and the effects' CSS exists only with the engine
  for (const [id, want] of Object.entries(FX_HOOKS)) {
    const c = ch[id].html; if (!c) continue;
    if (!new RegExp(`^<section\\b[^>]*\\bdata-fx="${want.fx}"`).test(c)) f.push(`fx: #${id} lost its data-fx="${want.fx}"`);
    for (const [hook, n] of want.hooks) { const got = (c.match(new RegExp(`\\s${hook}(?=[\\s=>])`, 'g')) ?? []).length; if (got !== n) f.push(`fx: #${id} has ${got} ${hook}, the effect needs ${n}`); }
    // a chapter whose effect pins a stage has ONE .pstage wrapper (no style until the engine adds `pin`: the effect never re-parents anything), opening on the header row and holding every hook
    if (want.stage) {
      const at = c.indexOf('<div class="pstage">');
      if ((c.match(/<div class="pstage">/g) ?? []).length !== 1) f.push(`fx: #${id} has ${(c.match(/<div class="pstage">/g) ?? []).length} .pstage wrappers, the pinned stage needs 1`);
      else if (!/<div class="pstage">\s*<div class="sh">/.test(c)) f.push(`fx: #${id}'s .pstage no longer opens on the header row (.sh)`);
      else {
        // the wrapper is the balanced <div> that opens at `at`: every hook the effect drives must be inside it
        let depth = 0, end = c.length; for (const m of c.slice(at).matchAll(/<div\b|<\/div>/g)) { depth += m[0] === '</div>' ? -1 : 1; if (!depth) { end = at + m.index + m[0].length; break; } }
        const inside = c.slice(at, end);
        for (const [hook, n] of want.hooks) if ((inside.match(new RegExp(`\\s${hook}(?=[\\s=>])`, 'g')) ?? []).length !== n) f.push(`fx: #${id}'s ${hook} is outside its .pstage wrapper`);
      }
    }
  }
  {
    const beats = ch.c02.html.split(/\sdata-beat=/).slice(1);
    for (const [i, b] of beats.entries()) for (const hook of ['data-type', 'data-tag']) if ((b.match(new RegExp(`\\s${hook}(?=[\\s=>])`, 'g')) ?? []).length !== 1) f.push(`fx: #c02 beat ${i + 1} does not carry exactly one ${hook}`);
  }
  // the effects' custom properties live in their own namespace: a bare --lg (the logo size) once resized the header brand when an effect reused the name
  for (const r of rules) if (/\bhtml\.fxl\b/.test(r.sel)) for (const m of r.body.matchAll(/(?:^|;)\s*(--[\w-]+)\s*:/g)) if (!m[1].startsWith('--fx-')) f.push(`fx: "${r.sel}" declares ${m[1]}: a custom property of the effects must start with --fx- (it would collide with the page's own)`);
  // everything in the stage-2B block of v3.css must hang on a part that only an effect adds (a class it creates, an attribute it sets) or be a --fx- variable: a rule
  // on a plain element would stay after dispose() and change the static chapter it gives back (.ia{position:relative} did)
  const b2at = css.indexOf('STAGE 2B · chapter effects');
  if (b2at < 0) f.push('fx: the stage-2B block of v3.css is gone');
  else for (const r of [...css.slice(css.lastIndexOf('/*', b2at)).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })))
    if (!r.sel.startsWith('@') && !r.sel.split(',').every((sel) => FX_ONLY.test(sel)) && !r.body.split(';').filter((d) => d.trim()).every((d) => /^\s*--fx-/.test(d))) f.push(`fx: "${r.sel}" is in the stage-2B block but styles an element no effect owns (it would outlive dispose())`);
  for (const r of rules) for (const sel of r.sel.split(',').map((x) => x.trim())) {
    if (FX_ONLY.test(sel) && !/\bhtml\.fxl\b/.test(sel)) f.push(`fx: "${sel}" styles a part that only an effect adds, but is not keyed to html.fxl`);
    if (FX_COPY.test(sel) && FX_HIDES.test(r.body) && !(/\bhtml\.fxl\b/.test(sel) && /\[data-fx-/.test(sel))) f.push(`fx: "${sel}" hides the copy of an effect chapter by default (only html.fxl [data-fx-…], an attribute the armed effect sets, may)`);
  }

  // chapter 03 is square: no rule that styles one of its parts may round it or cut it into a circle (the circular lenses are gone and stay gone)
  for (const r of rules) if (r.sel.split(',').some((sel) => C03_CSS.test(sel)) && /border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(r.body)) f.push(`round: "${r.sel}" makes a round shape in chapter 03 (square HUD geometry, no circles, no rounded corners)`);

  // chapter 04 ends with its last tab: no closing line that points at specimens now living in chapter 08, and a scroll length the engine's
  // timeline is scaled for (llm.ts: GIVEN). A mismatch would change the pacing of every beat without any error.
  if (textOf(html).includes(norm(P.espH2))) f.push(`structure: chapter 04 closes on «${norm(P.espH2)}» again (the specimens live in chapter 08)`);
  if (/class="lend\b/.test(ch.cL.html)) f.push('structure: chapter 04 has a .lend closing block again');
  const len = ch.cL.html.match(/id="cL" style="--len:([\d.]+)"/), given = +(readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').match(/GIVEN = ([\d.]+)/)?.[1] ?? NaN);
  if (!len || +len[1] !== given) f.push(`structure: chapter 04 is ${len ? len[1] : '(no --len)'} screens but llm.ts scales its timeline for ${given}`);

  for (const m of deltaRule(html, lang)) f.push(`delta: ${m}`);
  for (const m of wordmarkRule(html)) f.push(`wordmark: ${m}`);
  for (const m of tokensRule(html, lang)) f.push(`tokens: ${m}`);
  for (const m of chatRule(html, lang)) f.push(`chat: ${m}`);
  for (const m of sharpRule(html, lang)) f.push(`sharp: ${m}`);
  return f;
}

// ---------- the footer plate and the wordmark (/v3 only) ----------
// The closing footer (the brand row, the legal line and the wordmark) is a BLACK plate in every theme: paper, auto-light and dark alike, with the dark tokens scoped to it, light text and
// white runners always. «AI FROM SCRATCH» ends it as a ghost outline: the outlines of its letters (src/aegis/wordmark.ts), no copy, aria-hidden. The page's own picture is the outline fully
// drawn; the draw and the runners that lap its edges are an effect's (fx/wordmark.ts, html.fxl): they are never in the markup and never what a visitor without the engine is waiting for.
// It is on /v3 once, after the last chapter, in both layouts (one line, two lines), and never on `/` (the shared footer of the other public pages is not touched).
const balanced = (h, at, tag) => { let depth = 0, end = h.length; for (const m of h.slice(at).matchAll(new RegExp(`<${tag}\\b|</${tag}>`, 'g'))) { depth += m[0].startsWith('</') ? -1 : 1; if (!depth) { end = at + m.index + m[0].length; break; } } return h.slice(at, end); };
const colour = (v) => {                                                    // #rgb / #rrggbb / rgba(r,g,b,a) → [r,g,b,a]
  v = String(v).trim().toLowerCase(); let m;
  if ((m = /^#([0-9a-f]{3})$/.exec(v))) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  if ((m = /^#([0-9a-f]{6})$/.exec(v))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v))) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
};
const luminance = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
/** WCAG contrast of `fg` (any alpha) painted on the opaque `bg`. */
const contrast = (fg, bg) => { const mix = [0, 1, 2].map((i) => fg[3] * fg[i] + (1 - fg[3]) * bg[i]), a = luminance(mix) + 0.05, b = luminance(bg) + 0.05; return Math.max(a, b) / Math.min(a, b); };
function wordmarkRule(html) {
  const f = [];
  const open = [...html.matchAll(/<div\b[^>]*\bdata-fx="wordmark"[^>]*>/g)];
  if (open.length !== 1) { f.push(`the footer wordmark block appears ${open.length} times (expected 1)`); return f; }
  const at = open[0].index, block = balanced(html, at, 'div'), tag = open[0][0];
  if (!/\bclass="wmk"/.test(tag)) f.push('the wordmark block lost its class="wmk"');
  if (!/\baria-hidden="true"/.test(tag)) f.push('the wordmark block is not aria-hidden (it is a decoration with no copy)');
  // the plate: <footer class="endp"> after the last chapter, inside <main>, holding the brand row, the legal line and the wordmark
  const plates = [...html.matchAll(/<footer\b[^>]*\bclass="endp"[^>]*>/g)], c16 = html.indexOf('id="c16"'), main = html.indexOf('</main>');
  if (plates.length !== 1) f.push(`the black footer plate (<footer class="endp">) appears ${plates.length} times (expected 1)`);
  else {
    const pAt = plates[0].index, pEnd = html.indexOf('</footer>', pAt), plate = html.slice(pAt, pEnd);
    if (c16 < 0 || pAt < c16 || (main >= 0 && pAt > main)) f.push('the footer plate is not after the last chapter, inside <main>');
    if (!(at > pAt && at < pEnd)) f.push('the wordmark is not inside the footer plate (it would be on the page\'s theme, not on black)');
    if (!/<div class="foot">/.test(plate) || !/<div class="foot legal2">/.test(plate)) f.push('the footer plate lost its brand row or its legal line (they live on the black plate, not in the closing chapter)');
    const ch16 = html.slice(c16, pAt);
    if (/<div class="foot\b/.test(ch16)) f.push('a footer row is still inside the closing chapter (it belongs to the black plate)');
  }
  const wraps = [...block.matchAll(/<div class="wmr (wm[12])">([\s\S]*?)<\/svg>\s*<\/div>/g)];
  if (wraps.length !== 2 || wraps[0][1] !== 'wm1' || wraps[1][1] !== 'wm2') f.push(`the wordmark has ${wraps.length} layouts (expected 2, in order: .wm1 one line, .wm2 two lines)`);
  for (const w of wraps) {
    const cls = w[1], inner = w[2], svg = /<svg\b([^>]*)>([\s\S]*)$/.exec(inner), attrs = svg?.[1] ?? '', body = svg?.[2] ?? '';
    const vb = /\bviewBox="0 0 (\d+) (\d+)"/.exec(attrs);
    if (!vb || +vb[1] < 100 || +vb[2] < 20) f.push(`.${cls} has no viewBox (the box would not reserve its aspect ratio: layout shift)`);
    const lc = (/\bdata-lc="([\d,]+)"/.exec(attrs)?.[1] ?? '').split(',').filter(Boolean).map(Number), d = /\bd="(M[^"]*)"/.exec(body)?.[1] ?? '';
    if (lc.length < 2 || lc.some((c) => !(c > 0))) f.push(`.${cls} has no data-lc (the length of each contour: the runners are sized and timed by them)`);
    else if (lc.length !== (d.match(/M/g) ?? []).length) f.push(`.${cls}: data-lc lists ${lc.length} contours but the path has ${(d.match(/M/g) ?? []).length}`);
    if (!/\bfocusable="false"/.test(attrs)) f.push(`.${cls} is focusable (focusable="false" is missing)`);
    if (/\bstyle=|\baria-label=|\brole=/.test(attrs)) f.push(`.${cls} carries a style, an aria-label or a role (a decoration has none)`);
    const paths = [...body.matchAll(/<path\b([^>]*)\/?>/g)];
    if (paths.length !== 1 || !/\bclass="o"/.test(paths[0][1]) || d.length < 500) f.push(`.${cls} must hold exactly one <path class="o" d="M…"> (the outline); the runners are the effect's`);
    if (/<(?:text|title|desc|use|image|foreignObject|animate|animateTransform|set|style|script)\b/.test(body)) f.push(`.${cls} holds <text>, <title>, <use>, an animation or a script: the mark is paths only`);
  }
  if (/\bclass="[^"]*\b(?:wrs?|fxk)\b/.test(block) || /\bdata-fx-s\b/.test(block)) f.push('the markup already carries a runner (.wr / .wrs / .fxk) or a pre-state (data-fx-s): they are the effect\'s, added with the engine');
  if (textOf(block)) f.push('the wordmark block carries text (it is aria-hidden paths: no copy)');
  // the stylesheet: the outline is visible by default and nothing hides it, both layouts exist and switch, the plate is black in EVERY theme with light text, the runners are white, the stroke keeps its
  // pixel width, caps are square
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  if (!rules.some((r) => /(^|,)\s*\.wmk path\.o\s*(,|$)/.test(r.sel) && /\bfill:/.test(r.body) && /\bstroke:/.test(r.body) && /\bstroke-width:/.test(r.body))) f.push('no rule paints the outline (.wmk path.o needs a fill, a stroke and a stroke-width): the static page would show nothing');
  for (const r of rules) for (const sel of r.sel.split(',').map((x) => x.trim())) {
    if (!/\.wmk\b/.test(sel) || /\.wm[12]\b/.test(sel)) continue;
    if (/(?:^|;)\s*(?:opacity\s*:\s*0(?![.\d])|visibility\s*:\s*hidden|display\s*:\s*none|clip-path\s*:|stroke-dasharray\s*:|stroke-dashoffset\s*:|transform\s*:\s*scale\(0\b)/.test(r.body) && !(/\bhtml\.fxl\b/.test(sel) && /\[data-fx-|\.wrs?\b/.test(sel)))
      f.push(`"${sel}" hides the wordmark by default (only html.fxl [data-fx-…] or the effect's own .wr / .wrs may: the static page shows the outline fully drawn)`);
  }
  if (!rules.some((r) => r.sel === '.wmk .wm2' && /\bdisplay:none\b/.test(r.body)) || !/@media\s*\(max-width:640px\)\s*\{[^@]*\.wmk \.wm1\{display:none\}\.wmk \.wm2\{display:block\}/.test(css)) f.push('layout switch: .wm2 is not hidden by default, or phones (max-width:640px) do not swap to the two-line mark (both would show, or the one line would be tiny)');
  if (!rules.some((r) => r.sel === '.wmk path' && /vector-effect:\s*non-scaling-stroke/.test(r.body))) f.push('.wmk path lost vector-effect:non-scaling-stroke (the stroke and the runners\' dashes are in screen pixels: the effect sizes them that way)');
  // the plate is black whatever the theme: the dark tokens, scoped to .endp; nothing in the stylesheet lets a theme reach it; a straight solid cut at the top
  const endp = rules.find((r) => r.sel === '.endp' && /--bg:/.test(r.body));
  const tok = (n) => new RegExp(`(?:^|;)\\s*--${n}:\\s*([^;]+)`).exec(endp?.body ?? '')?.[1];
  if (!endp) f.push('the plate has no scoped tokens (.endp{--bg:#000;--l1:…}): it would take the page\'s theme');
  else {
    const bg = colour(tok('bg') ?? '');
    if (!bg || bg[3] !== 1 || bg[0] + bg[1] + bg[2] !== 0) f.push(`the plate's --bg is ${tok('bg')}: it must be black (#000) in every theme`);
    else for (const n of ['l1', 'l2', 'l3']) {
      const c = colour(tok(n) ?? ''), r = c && contrast(c, bg);
      if (!c) f.push(`the plate's --${n} is missing or unreadable`);
      else if (r < 4.5) f.push(`the plate's --${n} (${tok(n)}) is ${r.toFixed(2)}:1 on black: its small text must be at least 4.5:1 (WCAG AA)`);
    }
  }
  const plateRules = rules.filter((r) => r.sel.split(',').some((x) => /\.(?:endp|wmk|foot)\b/.test(x) && /\.endp\b|\.wmk\b/.test(x)));
  for (const r of plateRules) {
    if (/\[data-theme|prefers-color-scheme/.test(r.sel)) f.push(`"${r.sel}": a theme reaches the black plate (it is black in paper, auto-light and dark alike)`);
    if (r.sel.split(',').some((x) => /^\.endp$/.test(x.trim())) && /gradient|border-radius|\bborder-top\s*:/.test(r.body)) f.push(`"${r.sel}": the plate has a gradient, a corner or a top border (its top edge is a straight cut)`);
  }
  for (const m of css.matchAll(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{/g)) {                     // each such block, braces balanced (not the CSS that merely follows it)
    let depth = 1, i = m.index + m[0].length; for (; i < css.length && depth; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    if (/\.(?:wmk|endp)\b/.test(css.slice(m.index + m[0].length, i))) { f.push('a prefers-color-scheme rule reaches the black plate or the wordmark (it is black in every theme)'); break; }
  }
  if (!rules.some((r) => r.sel === '.endp' && /background:\s*var\(--bg\)/.test(r.body))) f.push('.endp lost background:var(--bg): the plate is not painted');
  if ([...css.matchAll(/--wm-run\s*:/g)].length) f.push('--wm-run is back (the runners are white in every theme; a themed colour would go white on white again)');
  const wr = rules.find((r) => /(^|,)\s*html\.fxl \.wmk \.wr\s*(,|$)/.test(r.sel));
  if (!wr) f.push('html.fxl .wmk .wr is gone: the runners have no style');
  else {
    if (!/stroke:\s*(?:#fff(?:fff)?|white)\s*(;|$)/i.test(wr.body)) f.push('the runners are not white (#fff): they run on a black plate in every theme');
    if (!/stroke-linecap:\s*square/.test(wr.body)) f.push('the runners\' caps are not square (the owner rejected rounded ones)');
  }
  const ov = rules.find((r) => /(^|,)\s*html\.fxl \.wmk \.wrs\s*(,|$)/.test(r.sel));
  if (!ov) f.push('html.fxl .wmk .wrs is gone: the runners\' overlay has no style');
  else {
    if (!/\bopacity:\s*0(?![.\d])/.test(ov.body)) f.push('the runners are visible by default (they run only while .run)');
    if (!/filter:\s*drop-shadow\(/.test(ov.body)) f.push('the runners\' glow (a drop-shadow on their overlay svg) is gone');
  }
  if (!rules.some((r) => /html\.fxl \.wmk\.run \.wr/.test(r.sel) && /animation:[^;]*\binfinite\b/.test(r.body))) f.push('html.fxl .wmk.run .wr lost its infinite animation (the runners lap the mark)');
  return f;
}
/** `/` (and the other public pages share its layout): the wordmark and the plate are /v3's and must not appear there. */
const rootRule = (html) => (/\bclass="wmk"|data-fx="wordmark"|\bclass="wmr\b|\bclass="endp"/.test(html) ? ['the footer wordmark or its black plate is on `/` (they are /v3 only: the shared footer of the public pages is untouched)'] : []);

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
    ['chapter 02 without its data-fx name', html.replace('data-fx="chat-stream"', 'data-fx="x"'), /fx: #c02 lost its data-fx/],
    ['a chapter 02 beat without its typed answer hook', html.replace(' data-type', ''), /fx: #c02 has 2 data-type|fx: #c02 beat 1 does not carry exactly one data-type/],
    ['a chapter 02 beat without its lesson tag hook', inChapter('c02', (c) => c.replace(/ data-tag(?=[\s>])/, '')), /fx: #c02 has 2 data-tag/],
    ['chapter 02 without its chat hook', html.replace(' data-chat', ''), /fx: #c02 has 0 data-chat/],
    ['a chapter 02 window gone', inChapter('c02', (c) => c.replace(/<div class="case" data-beat="2">[\s\S]*?<\/figure> <p class="tag" data-tag>[\s\S]*?<\/p> <\/div>/, '')), /fx: #c02 has 2 data-beat/],
    ['a chapter 02 window without its window hook', inChapter('c02', (c) => c.replace(' data-win', '')), /fx: #c02 has 2 data-win/],
    ['chapter 02 without its context bracket hook', inChapter('c02', (c) => c.replace(' data-ctx', '')), /fx: #c02 has 0 data-ctx/],
    ['an effect class (.ty) styled without html.fxl', html.replace('html.fxl .ty{', '.ty{'), /fx: "\.ty" styles a part that only an effect adds/],
    ['an effect attribute rule without html.fxl', html.replace('html.fxl [data-fx-live] .caret{', '[data-fx-live] .caret{'), /fx: "\[data-fx-live\] \.caret" styles a part that only an effect adds/],
    ['the typed answer hidden by default', html.replace('html.fxl [data-fx-s="arm"] .rp,', '.rp,'), /fx: "\.rp" hides the copy of an effect chapter by default/],
    ['the typed answer hidden under html.fxl without the armed attribute', html.replace('html.fxl [data-fx-s="arm"] .rp,', 'html.fxl .rp,'), /fx: "html\.fxl \.rp" hides the copy/],
    ['a CSS rule that hides a lesson tag by default', html.replace('</head>', '<style>.tag{opacity:0}</style></head>'), /fx: "\.tag" hides the copy/],
    ['a CSS rule that makes a figure transparent by default', html.replace('</head>', '<style>.clock .ctr b{color:transparent}</style></head>'), /fx: "\.clock \.ctr b" hides the copy/],
    ['chapter 03 without its data-fx name', html.replace('data-fx="sharpen"', 'data-fx="x"'), /fx: #c03 lost its data-fx/],
    ['chapter 03 without its panel hook', html.replace(' data-sharp', ''), /fx: #c03 has 0 data-sharp/],
    ['chapter 03 without its request-row hook', html.replace(' data-prompt', ''), /fx: #c03 has 0 data-prompt/],
    ['a chapter 03 context chip without its hook', inChapter('c03', (c) => c.replace(' data-slot', '')), /fx: #c03 has 2 data-slot/],
    ['a chapter 03 bar without its final-height hook', inChapter('c03', (c) => c.replace(/ data-bar="/, ' data-x="')), /fx: #c03 has 9 data-bar/],
    ['a chapter 03 bar without its flat-height hook', inChapter('c03', (c) => c.replace(/ data-flat="/, ' data-x="')), /fx: #c03 has 9 data-flat/],
    ['chapter 05 without its data-fx name', html.replace('data-fx="track"', 'data-fx="x"'), /fx: #c05 lost its data-fx/],
    ['chapter 05 without its track hook', inChapter('c05', (c) => c.replace(' data-track', '')), /fx: #c05 has 0 data-track/],
    ['a chapter 05 figure without its number hook', html.replace(' data-cifra', ''), /fx: #c05 has 5 data-cifra/],
    ['chapter 05 without its pinned-stage wrapper', inChapter('c05', (c) => c.replace('<div class="pstage">', '<div class="x">')), /fx: #c05 has 0 \.pstage wrappers/],
    ['chapter 05\'s wrapper not opening on the header row', inChapter('c05', (c) => c.replace(/(<div class="pstage">)\s*(<div class="sh">)/, '$1<div class="y"></div>$2')), /fx: #c05's \.pstage no longer opens on the header row/],
    ['chapter 05\'s track outside its wrapper', inChapter('c05', (c) => c.replace('<div class="figs" data-track>', '</div><div class="figs" data-track>').replace(/<\/div>\s*<\/section>/, '</section>')), /fx: #c05's data-track is outside its \.pstage wrapper/],
    ['chapter 05 with the pin class in the markup', html.replace('<section id="c05" class="sec cx figs-sec"', '<section id="c05" class="sec cx figs-sec pin"'), /layout: #c05 carries the effects' `pin` class/],
    ['the pinned stage keyed to html.fx instead of html.fxl', html.replace('html.fxl .pin .pstage{', 'html.fx .pin .pstage{'), /fx: "html\.fx \.pin \.pstage" styles a part that only an effect adds/],
    ['the pinned section height without html.fxl', html.replace('html.fxl #c05.pin{--fx-cw', '#c05.pin{--fx-cw'), /fx: "#c05\.pin" styles a part that only an effect adds/],
    ['the chapter 03 winner overlay without html.fxl', html.replace('html.fxl [data-sharp][data-fx-s] .bw i.hi::after{', '[data-sharp][data-fx-s] .bw i.hi::after{'), /fx: "\[data-sharp\]\[data-fx-s\] \.bw i\.hi::after" styles a part that only an effect adds/],
    ['a stage-2B rule on a plain chapter 03 part (it would outlive dispose)', html.replace('html.fxl [data-sharp][data-fx-s] .bw i.hi{', 'html.fxl .bw i.hi{'), /fx: "html\.fxl \.bw i\.hi" is in the stage-2B block but styles an element no effect owns/],
    ['chapter 06 without its data-fx name', html.replace('data-fx="implode"', 'data-fx="x"'), /fx: #c06 lost its data-fx/],
    ['chapter 06 without its grid hook', inChapter('c06', (c) => c.replace(' data-nots', '')), /fx: #c06 has 0 data-nots/],
    ['a chapter 06 word without its hook', inChapter('c06', (c) => c.replace(' data-word', '')), /fx: #c06 has 5 data-word/],
    ['chapter 06 without its closing-line hook', inChapter('c06', (c) => c.replace(' data-final', '')), /fx: #c06 has 0 data-final/],
    ['chapter 06 without its pinned-stage wrapper', inChapter('c06', (c) => c.replace('<div class="pstage">', '<div class="x">')), /fx: #c06 has 0 \.pstage wrappers/],
    ['chapter 06\'s closing line outside its wrapper', inChapter('c06', (c) => c.replace(/<h2 id="c06h"/, '</div><h2 id="c06h"').replace(/<\/div>\s*<\/section>/, '</section>')), /fx: #c06's data-final is outside its \.pstage wrapper/],
    ['chapter 06 with the pin class in the markup', html.replace('<section id="c06" class="sec cx"', '<section id="c06" class="sec cx pin"'), /layout: #c06 carries the effects' `pin` class/],
    ['the chapter 06 pinned length without html.fxl', html.replace('html.fxl #c06.pin{', '#c06.pin{'), /fx: "#c06\.pin" styles a part that only an effect adds/],
    ['the chapter 06 length on the page\'s own --len', html.replace('html.fxl #c06.pin{--fx-len:', 'html.fxl #c06.pin{--len:'), /fx: "html\.fxl #c06\.pin" declares --len/],
    ['the particle canvas styled without html.fxl', html.replace('html.fxl .imp{', '.imp{'), /fx: "\.imp" styles a part that only an effect adds/],
    ['a stage-2B rule on the closing line itself (it would outlive dispose)', html.replace('html.fxl #c06.pin .hx{', 'html.fxl .hx{'), /fx: "html\.fxl \.hx" is in the stage-2B block but styles an element no effect owns/],
    ['a source comment back in the inline stylesheet', html.replace('/*! ---------- STAGE 2B', '/* ---------- STAGE 2B'), /weight: the inline stylesheet ships its source comments/],
    ['chapter 07 without its data-fx name', html.replace('data-fx="ring"', 'data-fx="x"'), /fx: #c07 lost its data-fx/],
    ['chapter 07 without its clock hook', inChapter('c07', (c) => c.replace(' data-ring aria-hidden', ' aria-hidden')), /fx: #c07 has 0 data-ring,/],
    ['a chapter 07 tick without its hook', inChapter('c07', (c) => c.replace(' data-tick', '')), /fx: #c07 has 11 data-tick/],
    ['a chapter 07 figure counting up again (a second count hook)', inChapter('c07', (c) => c.replace('<dt>12</dt>', '<dt data-count="12">12</dt>')), /fx: #c07 has 2 data-count, the effect needs 1/],
    ['a chapter 07 counter without its count hook', inChapter('c07', (c) => c.replace(' data-count="40"', '')), /fx: #c07 has 0 data-count, the effect needs 1/],
    ['chapter 07 with the pin class in the markup', html.replace('<section id="c07" class="sec cx"', '<section id="c07" class="sec cx pin"'), /layout: #c07 carries the effects' `pin` class/],
    ['the clock ticks styled without html.fxl', html.replace('html.fxl .clock[data-fx-s] .tick{', '.clock[data-fx-s] .tick{'), /fx: "\.clock\[data-fx-s\] \.tick" styles a part that only an effect adds/],
    ['the counter overlay styled without html.fxl', html.replace('html.fxl .num{', '.num{'), /fx: "\.num" styles a part that only an effect adds/],
    ['the pen styled without html.fxl', html.replace('html.fxl .pen{', '.pen{'), /fx: "\.pen" styles a part that only an effect adds/],
    ['the real numbers made transparent for good (not only while an effect runs)', html.replace('html.fxl [data-fx-s] [data-count]{', '[data-count]{'), /fx: "\[data-count\]" is in the stage-2B block but styles an element no effect owns/],
    ['the counter overlay hidden by default', html.replace('</head>', '<style>.clock .ctr b{opacity:0}</style></head>'), /fx: "\.clock \.ctr b" hides the copy/],
    ['the closing line of chapter 06 hidden by default', html.replace('</head>', '<style>.hx{opacity:0}</style></head>'), /fx: "\.hx" hides the copy/],
    ['the struck words hidden by default', html.replace('</head>', '<style>s[data-word]{color:transparent}</style></head>'), /fx: "s\[data-word\]" hides the copy/],
    ['chapter 08 without its data-fx name', html.replace('data-fx="bars-once"', 'data-fx="x"'), /fx: #c08 lost its data-fx/],
    ['chapter 08 without its bars hook', inChapter('c08', (c) => c.replace(' data-bars', '')), /fx: #c08 has 0 data-bars/],
    ['the chapter 08 bar pre-state styled without html.fxl', html.replace('html.fxl [data-fx-s] .cb i{', '[data-fx-s] .cb i{'), /fx: "\[data-fx-s\] \.cb i" styles a part that only an effect adds/],
    ['the chapter 08 bars hidden by default', html.replace('</head>', '<style>.cb i{opacity:0}</style></head>'), /fx: "\.cb i" hides the copy/],
    ['a stage-2B rule on a plain element (it would outlive dispose)', html.replace('html.fxl [data-fx-live] .caret{', 'html.fxl .caret{'), /fx: "html\.fxl \.caret" is in the stage-2B block but styles an element no effect owns/],
    ['a chapter 03 custom property on the page\'s own name', html.replace('html.fxl [data-sharp][data-fx-s] .bw i.hi{position:relative;', 'html.fxl [data-sharp][data-fx-s] .bw i.hi{--lg:1px;position:relative;'), /fx: "html\.fxl \[data-sharp\]\[data-fx-s\] \.bw i\.hi" declares --lg/],
    ['chapter 02 with the pin class in the markup', html.replace('<section id="c02" class="sec cx s02"', '<section id="c02" class="sec cx s02 pin"'), /layout: #c02 carries the effects' `pin` class/],
    ['the footer wordmark block gone', (() => { const at = /<div class="wmk"/.exec(html).index; return html.replace(balanced(html, at, 'div'), ''); })(), /wordmark: the footer wordmark block appears 0 times/],
    ['the footer wordmark twice', (() => { const at = /<div class="wmk"/.exec(html).index, b = balanced(html, at, 'div'); return html.replace(b, b + b); })(), /wordmark: the footer wordmark block appears 2 times/],
    ['the footer wordmark outside the black plate', (() => { const at = /<div class="wmk"/.exec(html).index, b = balanced(html, at, 'div'); return html.replace(b, '').replace('<footer class="endp">', b + '<footer class="endp">'); })(), /wordmark: the wordmark is not inside the footer plate/],
    ['the footer plate gone', html.replace('<footer class="endp">', '<footer class="x">'), /wordmark: the black footer plate .* appears 0 times/],
    ['the footer plate before the last chapter', (() => { const at = html.indexOf('<footer class="endp">'), end = html.indexOf('</footer>', at) + 9, b = html.slice(at, end); return html.replace(b, '').replace(/<main[^>]*>/, (m) => m + b); })(), /wordmark: the footer plate is not after the last chapter/],
    ['the footer wordmark not aria-hidden', html.replace('data-fx="wordmark" aria-hidden="true"', 'data-fx="wordmark"'), /wordmark: the wordmark block is not aria-hidden/],
    ['text inside the footer wordmark', html.replace('<path class="o"', '<text>AI FROM SCRATCH</text><path class="o"'), /wordmark: \.wm1 holds <text>/],
    ['a runner already in the markup', html.replace('<path class="o"', '<path class="wr" d="M0 0"/><path class="o"'), /wordmark: the markup already carries a runner/],
    ['the footer wordmark without its viewBox', html.replace(/(<div class="wmr wm1"><svg )viewBox="[^"]*"/, '$1'), /wordmark: \.wm1 has no viewBox/],
    ['the footer wordmark without its contour lengths', html.replace(/(<div class="wmr wm2"><svg [^>]*?) data-lc="[\d,]*"/, '$1'), /wordmark: \.wm2 has no data-lc/],
    ['the footer wordmark with a wrong contour count', html.replace(/(<div class="wmr wm1"><svg [^>]*?data-lc="\d+),/, '$1'), /wordmark: \.wm1: data-lc lists 17 contours but the path has 18/],
    ['the footer wordmark outline hidden by default', html.replace('</head>', '<style>.wmk path.o{opacity:0}</style></head>'), /wordmark: "\.wmk path\.o" hides the wordmark by default/],
    ['the footer wordmark drawn back (dash) by default', html.replace('</head>', '<style>.wmk path.o{stroke-dasharray:9;stroke-dashoffset:9}</style></head>'), /wordmark: "\.wmk path\.o" hides the wordmark by default/],
    ['the footer wordmark runners styled without html.fxl', html.replace('html.fxl .wmk .wr{', '.wmk .wr{'), /fx: "\.wmk \.wr" styles a part that only an effect adds/],
    ['the footer wordmark runners overlay styled without html.fxl', html.replace('html.fxl .wmk .wrs{', '.wmk .wrs{'), /fx: "\.wmk \.wrs" styles a part that only an effect adds/],
    ['the footer wordmark draw pre-state styled without html.fxl', html.replace('html.fxl .wmk[data-fx-s] path.o{', '.wmk[data-fx-s] path.o{'), /fx: "\.wmk\[data-fx-s\] path\.o" styles a part that only an effect adds/],
    ['the footer plate follows the paper theme', html.replace('</head>', '<style>html[data-theme="paper"] .endp{--bg:#F2F2F2}</style></head>'), /wordmark: "html\[data-theme="paper"\] \.endp": a theme reaches the black plate/],
    ['the footer plate follows the system light theme', html.replace('</head>', '<style>@media (prefers-color-scheme:light){html[data-theme="auto"] .endp{--bg:#F2F2F2}}</style></head>'), /wordmark: a prefers-color-scheme rule reaches the black plate/],
    ['a paper colour for the runners back', html.replace('</head>', '<style>html[data-theme="paper"] .wmk{--wm-run:#000}</style></head>'), /wordmark: --wm-run is back/],
    ['the footer plate not black', html.replace(/(\.endp\{[^}]*?)--bg:#000;/, '$1--bg:#111;'), /wordmark: the plate's --bg is #111/],
    ['the footer plate text too faint on black', html.replace(/(\.endp\{[^}]*?--l3:)rgba\(235,235,245,\.50\)/, '$1rgba(235,235,245,.30)'), /wordmark: the plate's --l3 \(rgba\(235,235,245,\.30\)\) is [\d.]+:1 on black/],
    ['the footer plate with a gradient', html.replace('</head>', '<style>.endp{background:linear-gradient(#000,#111)}</style></head>'), /wordmark: "\.endp": the plate has a gradient/],
    ['the footer plate unpainted', html.replace('.endp{position:relative;z-index:2;background:var(--bg);color:var(--l1)}', '.endp{position:relative;z-index:2;color:var(--l1)}'), /wordmark: \.endp lost background:var\(--bg\)/],
    ['runners not white', html.replace('html.fxl .wmk .wr{stroke:#fff;', 'html.fxl .wmk .wr{stroke:#999;'), /wordmark: the runners are not white/],
    ['rounded runner caps', html.replace('stroke-linecap:square', 'stroke-linecap:round'), /wordmark: the runners' caps are not square/],
    ['both layouts of the wordmark on screen', html.replace('.wmk .wm2{display:none}', '.wmk .wm2{display:block}'), /wordmark: layout switch/],
    ['the wordmark stroke scales with the mark', html.replace('.wmk path{fill:none;vector-effect:non-scaling-stroke}', '.wmk path{fill:none}'), /wordmark: \.wmk path lost vector-effect/],
    ['runners that no longer lap', html.replace('var(--fx-ph,0s) infinite', 'var(--fx-ph,0s) 1'), /wordmark: html\.fxl \.wmk\.run \.wr lost its infinite animation/],
    ['runners visible by default', html.replace('drop-shadow(0 0 6px rgba(255,255,255,.9));opacity:0;', 'drop-shadow(0 0 6px rgba(255,255,255,.9));opacity:.85;'), /wordmark: the runners are visible by default/],
    ['runners without their glow', html.replace('filter:drop-shadow(0 0 6px rgba(255,255,255,.9));opacity:0;transition', 'opacity:0;transition'), /wordmark: the runners' glow/],
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
  const ctx = ctxOf(STR[lang].pub.land.bD), realA = piecesOf(TOKEN_FILE[lang], STR[lang].pub.land.aEjemplo), first = show(realA[0][0]);
  const heur = lang === 'es' ? ['Carta', 'gena', 'es', 'hermo', 'sa'] : ['Carta', 'gena', 'is', 'beaut', 'iful'];   // the page's old heuristic cut of the example sentence
  const rowAhtml = (parts) => parts.map((t) => `<div class="tk"><b>${t}</b></div>`).join('');
  const mut = {
    'candidate chip back in the Cartagena row': html.replace('<div class="chips ctx"', '<div class="tk ans"><b>Max</b></div><div class="chips ctx"'),
    'card context line removed': html.replace(/<p class="pctx">[\s\S]*?<\/p>/, ''),
    'candidate name typed into row A': html.replace(`<div class="tk"><b>${first}</b></div>`, '<div class="tk"><b>Max</b></div>'),
    'a context piece dropped': html.replace(/<div class="tk cw" data-w="\d+"><b>[^<]*<\/b><\/div>/, ''),
    'a real token of row A changed': html.replace(`<div class="tk"><b>${first}</b></div>`, `<div class="tk"><b>${first}x</b></div>`),
    'row A cut by the page\'s heuristic again (Carta | gena | ...)': html.replace(/(<div class="chips" aria-label="[^"]*">)[\s\S]*?(<\/div>\s*<p class="tokref">)/, (_m, a, c) => a + rowAhtml(heur) + c),
    'the leading space of a token shown as a space, not as a middle dot': html.replace(/(<div class="tk cw" data-w="\d+"><b>)·/, '$1 '),
    'the context row cut into whole words (not by the tokenizer)': html.replace(/(<div class="chips ctx"[^>]*>)[\s\S]*?(<div class="tk ans">)/, (_m, a, c) => a + ctx.split(/\s+/).map((w, i) => `<div class="tk cw" data-w="${i}"><b>${w}</b></div>`).join('') + c),
    'a context chip with the wrong word index': html.replace(/(<div class="tk cw" data-w=")(\d+)("><b>[^<]*<\/b><\/div>)(?![\s\S]*<div class="tk cw")/, '$19$3'),
    'the predicted chip shown without its leading-space marker (the name, not the token)': html.replace(/(<div class="tk ans"><b>)·/, '$1'),
    'the predicted chip is the whole multi-word name, not one token': html.replace(/(<div class="tk ans"><b>)[^<]*/, '$1·Sr. Mostacho'),
    'the source label of the chips gone': html.replace(/<p class="tokref">[\s\S]*?<\/p>/, ''),
    'the source label of the chips said twice': html.replace('<div class="chips ctx"', '<p class="tokref">x</p><div class="chips ctx"'),
  };
  let bad = 0;
  if (deltaRule(html, lang).length) return [0, 0];                 // the real page is judged by the loop below
  for (const [what, m] of Object.entries(mut)) if (m === html || !deltaRule(m, lang).length) { console.error(`FAIL self-test: deltaRule does not catch "${what}"`); bad++; }
  return [bad, Object.keys(mut).length];
}
// The same for the tokens the page ships to the effects.
function tokensSelfTest(html, lang) {
  if (tokensRule(html, lang).length) return [0, 0];
  const edit = (fn) => html.replace(/(<script type="application\/json" id="v3-tokens"[^>]*>)([\s\S]*?)(<\/script>)/, (_m, a, b, c) => { const o = JSON.parse(b); fn(o); return a + JSON.stringify(o) + c; });
  const k0 = Object.keys(JSON.parse(html.match(/id="v3-tokens"[^>]*>([\s\S]*?)<\/script>/)[1]))[2];
  const mut = {
    'the token data gone': html.replace(/<script type="application\/json" id="v3-tokens"[\s\S]*?<\/script>/, ''),
    'an entry missing from the token data': edit((o) => { delete o[k0]; }),
    'an entry that is not a chip string': edit((o) => { o['Una frase que ya no es un chip'] = [['Una', 1], [' frase', 2]]; }),
    'pieces that do not join back into their string': edit((o) => { o[k0][0][0] += 'x'; }),
    'pieces that are not the ones of the committed file': edit((o) => { const p = o[k0]; if (p.length > 1) { p[0][0] += p[1][0]; p.splice(1, 1); } else p[0][1] += 1; }),
    'a chip string that is not on the page (a stale token file)': html.split(norm(STR[lang].pub.v3.cierreH)).join('Otra frase').replace(/(id="v3-tokens"[^>]*>)/, '$1'),
    'chapter 08\'s free-typing specimen without its tag': html.replace(/<div class="ph">[^<]*<\/div>(\s*<div id="tokens")/, '$1'),
  };
  let bad = 0;
  for (const [what, m] of Object.entries(mut)) if (m === html || !tokensRule(m, lang).length) { console.error(`FAIL self-test: tokensRule does not catch "${what}"`); bad++; }
  return [bad, Object.keys(mut).length];
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
  // the chapters' effects (src/aegis/fx): built in the task that switches html.fxl on (so their layout and pre-states are there before the first tall frame), before the
  // scroll starts, and undone with the layout when the engine fails after it
  const iFxl = src.indexOf("classList.add('fxl')"), iFx = src.indexOf('.initFx('), iStart = src.indexOf('startScroll();');
  if (iFx < 0) f.push("it no longer builds the chapters' effects (initFx)");
  else if (iFx < iFxl || iStart < iFx) f.push('initFx() is not between the switch of html.fxl and startScroll(): an effect would arm before its layout exists, or after the reader can scroll');
  const gb = src.match(/const giveBack = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';
  if (!/\bfx\.dispose\(\)/.test(gb)) f.push('giveBack() does not dispose the chapters\' effects: a failed engine would leave pre-hidden answers behind');
  if (/\bawait\b[^;\n]*initFx|initFx\([^)]*\)\s*\.then/.test(src)) f.push('initFx() is awaited: an effect would arm after the tall layout was painted');
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
    ['no effects at all', src.replace('.initFx()', '.noFx()'), /no longer builds the chapters' effects/],
    ['effects armed before html.fxl', src.replace("    fx = fxm ? fxm.initFx() : null;", '').replace("laid = true; de.classList.add('fxl');", "fx = fxm ? fxm.initFx() : null; laid = true; de.classList.add('fxl');"), /initFx\(\) is not between/],
    ['effects armed after the scroll started', src.replace("    fx = fxm ? fxm.initFx() : null;", '').replace('    laid = false;  ', "    fx = fxm ? fxm.initFx() : null; laid = false;  "), /initFx\(\) is not between/],
    ['effects not disposed when the engine fails', src.replace("if (fx) { try { fx.dispose(); }", "if (fx) { try { fx.disposed(); }"), /giveBack\(\) does not dispose/],
    ['effects awaited', src.replace('fx = fxm ? fxm.initFx() : null;', 'fx = fxm ? await fxm.initFx() : null;'), /initFx\(\) is awaited/],
  ];
  for (const [what, m, expect] of cases) { const got = engineBoot(m); if (m === src || !got.some((g) => expect.test(g))) { console.error(`FAIL self-test: engineBoot does not catch "${what}" (got ${got.join(' | ') || 'nothing'})`); bad++; } }
  return [bad, cases.length];
}

// ---------- the effect modules (src/aegis/fx/*.ts) ----------
// The effects are code that touches a page whose copy is its own gate's business. They write no copy (text comes from the DOM), they animate only transform,
// opacity, clip-path and filter (layout is CSS under html.fxl, decided once at attach), and an effect that pre-arms something (hides it, waiting) does it only to
// what is below the fold. `files` is { 'c02.ts': source, ... }.
const FX_PREARM = ['c02.ts', 'c03.ts', 'c07.ts', 'c08.ts', 'wordmark.ts'];                              // modules that arm pre-states for play-once effects: they must ask belowFold() first (a scrubbed one is a function of the scroll position and arms nothing)
const FX_MODULES = ['index.ts', 'common.ts', 'c02.ts', 'c03.ts', 'c05.ts', 'c06.ts', 'c07.ts', 'c08.ts', 'wordmark.ts'];
const ANIMATED = new Set(['transform', 'opacity', 'clipPath', 'filter', 'willChange']);
function fxSource(files) {
  const f = [];
  for (const name of FX_MODULES) if (typeof files[name] !== 'string') f.push(`${name}: the module is missing`);
  for (const [name, src] of Object.entries(files)) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    if (/\.(?:textContent|innerText|innerHTML|outerHTML)\s*=\s*(?:'[^']|"[^"]|`)/.test(code)) f.push(`${name}: writes a string literal into the page (the copy is the HTML's; an effect only moves what is there)`);
    if (/\b(?:createTextNode|insertAdjacentText|insertAdjacentHTML|document\.write)\s*\(/.test(code)) f.push(`${name}: writes text or markup into the page (an effect adds empty, aria-hidden parts only)`);
    if (/\bel\(\s*['"][a-z0-9]+['"]\s*,\s*(?:['"][^'"]*['"]|undefined|null)\s*,\s*['"`]/.test(code)) f.push(`${name}: builds an element with literal content`);
    for (const m of code.matchAll(/\.style\.(\w+)\s*=(?!=)/g)) if (!ANIMATED.has(m[1])) f.push(`${name}: sets style.${m[1]} (an effect changes transform, opacity, clip-path and filter; layout is CSS under html.fxl)`);
    for (const m of code.matchAll(/\.style\.setProperty\(\s*['"`]([^'"`]*)/g)) {
      if (m[1].startsWith('--')) { if (!m[1].startsWith('--fx-')) f.push(`${name}: sets the custom property ${m[1]}: the effects' own start with --fx- (a bare name can collide with the page's, as --lg did)`); }
      else if (!['transform', 'opacity', 'clip-path', 'filter', 'will-change'].includes(m[1])) f.push(`${name}: sets the CSS property ${m[1]} (an effect changes transform, opacity, clip-path and filter)`);
    }
    if (/\bclassList\.(?:add|toggle)\(\s*['"](?:fx|fxl|ready|eng-off|nogl|rm)['"]/.test(code)) f.push(`${name}: switches an engine mode class (only main.ts decides the mode)`);
  }
  for (const name of FX_PREARM) if (typeof files[name] === 'string' && !/\b(?:belowFold|once)\(/.test(files[name])) f.push(`${name}: arms a pre-state without asking belowFold() (a section in view or above must stay final; once() asks it)`);
  if (typeof files['common.ts'] === 'string' && !/\bbelowFold\(/.test(/export function once\b[\s\S]*?return \{ state/.exec(files['common.ts'])?.[0] ?? '')) f.push('common.ts: once() arms without asking belowFold() (every play-once effect that uses it would pre-hide a section in view)');
  if (typeof files['wordmark.ts'] === 'string' && !/new IntersectionObserver\(/.test(files['wordmark.ts'])) f.push('wordmark.ts: the runners are not tied to the mark being on screen (an IntersectionObserver): they would lap for nobody');
  if (typeof files['index.ts'] === 'string' && !/export function initFx\b/.test(files['index.ts'])) f.push('index.ts: initFx() is gone');
  if (typeof files['common.ts'] === 'string' && !/export function effect\b[\s\S]*dispose\(\)/.test(files['common.ts'])) f.push('common.ts: effect() no longer undoes a half-built effect');
  return f;
}
function fxSourceSelfTest(files) {
  if (fxSource(files).length) return [0, 0];                         // the real files are judged by the run below
  const cases = [
    ['a copy literal written with textContent', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "const _x = document.body; _x.textContent = 'Hola';\nexport function initC02") }, /writes a string literal/],
    ['a copy literal written with innerHTML', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "const _x = document.body; _x.innerHTML = '<b>Hola</b>';\nexport function initC02") }, /writes a string literal/],
    ['a text node created', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "document.createTextNode('Hola');\nexport function initC02") }, /writes text or markup/],
    ['an element built with literal content', { ...files, 'c02.ts': files['c02.ts'].replace("el('i', 'gh')", "el('i', 'gh', 'Hola')") }, /builds an element with literal content/],
    ['a layout property animated (style.width)', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "document.body.style.width = '1px';\nexport function initC02") }, /sets style\.width/],
    ['a layout property animated (style.top)', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "document.body.style.top = '1px';\nexport function initC02") }, /sets style\.top/],
    ['a layout property set with setProperty', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "document.body.style.setProperty('height', '1px');\nexport function initC02") }, /sets the CSS property height/],
    ['a custom property of the page reused (--lg)', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "document.body.style.setProperty('--lg', '1px');\nexport function initC02") }, /sets the custom property --lg/],
    ['a template literal written into the page', { ...files, 'c03.ts': files['c03.ts'].replace('export function initC03', "document.body.innerHTML = `<b>${1}</b>`;\nexport function initC03") }, /writes a string literal/],
    ['a pre-state armed without once() or belowFold() (chapter 03)', { ...files, 'c03.ts': files['c03.ts'].replace('once(panel, undo', 'go(panel, undo') }, /c03\.ts: arms a pre-state without asking belowFold/],
    ['a layout property animated (chapter 03, style.height)', { ...files, 'c03.ts': files['c03.ts'].replace('export function initC03', "document.body.style.height = '1px';\nexport function initC03") }, /c03\.ts: sets style\.height/],
    ['a literal written by chapter 03', { ...files, 'c03.ts': files['c03.ts'].replace('export function initC03', "document.body.textContent = 'x';\nexport function initC03") }, /c03\.ts: writes a string literal/],
    ['a custom property of the page reused by chapter 03 (--lg)', { ...files, 'c03.ts': files['c03.ts'].replace("panel.style.setProperty('--fx-s'", "panel.style.setProperty('--lg'") }, /c03\.ts: sets the custom property --lg/],
    ['an engine mode class switched by an effect', { ...files, 'c02.ts': files['c02.ts'].replace('export function initC02', "document.documentElement.classList.add('nogl');\nexport function initC02") }, /switches an engine mode class/],
    ['a pre-state armed without belowFold()', { ...files, 'c02.ts': files['c02.ts'].replace('if (!belowFold(w.el)) continue;', '') }, /arms a pre-state without asking belowFold/],
    ['a pre-state armed without belowFold() (chapter 07)', { ...files, 'c07.ts': files['c07.ts'].replaceAll('belowFold(', 'Boolean(') }, /c07\.ts: arms a pre-state without asking belowFold/],
    ['a counter that writes a literal (chapter 07)', { ...files, 'c07.ts': files['c07.ts'].replace('ov.textContent = String(k)', "ov.textContent = 'x'") }, /c07\.ts: writes a string literal/],
    ['a layout property animated (chapter 07, style.width)', { ...files, 'c07.ts': files['c07.ts'].replace('export function initC07', "document.body.style.width = '1px';\nexport function initC07") }, /c07\.ts: sets style\.width/],
    ['a pre-state armed without once() or belowFold() (chapter 08)', { ...files, 'c08.ts': files['c08.ts'].replace('once(box, undo', 'go(box, undo') }, /c08\.ts: arms a pre-state without asking belowFold/],
    ['a layout property animated (chapter 08, style.width)', { ...files, 'c08.ts': files['c08.ts'].replace('export function initC08', "document.body.style.width = '1px';\nexport function initC08") }, /c08\.ts: sets style\.width/],
    ['a pre-state armed without once() or belowFold() (wordmark)', { ...files, 'wordmark.ts': files['wordmark.ts'].replace('once(box, undo', 'go(box, undo') }, /wordmark\.ts: arms a pre-state without asking belowFold/],
    ['a layout property animated (wordmark, style.width)', { ...files, 'wordmark.ts': files['wordmark.ts'].replace('export function initWordmark', "document.body.style.width = '1px';\nexport function initWordmark") }, /wordmark\.ts: sets style\.width/],
    ['a literal written by the wordmark', { ...files, 'wordmark.ts': files['wordmark.ts'].replace('export function initWordmark', "document.body.textContent = 'x';\nexport function initWordmark") }, /wordmark\.ts: writes a string literal/],
    ['runners that lap whether or not the mark is on screen', { ...files, 'wordmark.ts': files['wordmark.ts'].replace('new IntersectionObserver(', 'new Foo(') }, /wordmark\.ts: the runners are not tied to the mark being on screen/],
    ['once() that arms without asking belowFold()', { ...files, 'common.ts': files['common.ts'].replace('if (belowFold(at)) { state', 'if (true) { state') }, /common\.ts: once\(\) arms without asking belowFold/],
    ['a module gone', { ...files, 'c02.ts': undefined }, /c02\.ts: the module is missing/],
    ['effect() that stops undoing a half-built effect', { ...files, 'common.ts': files['common.ts'].replace(/dispose\(\);\s*throw e;/, 'throw e;').replace('const dispose = ', 'const disposeX = ') }, /effect\(\) no longer undoes/],
  ];
  let bad = 0;
  for (const [what, m, expect] of cases) { const got = fxSource(Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined))); if (!got.some((g) => expect.test(g))) { console.error(`FAIL self-test: fxSource does not catch "${what}" (got ${got.join(' | ') || 'nothing'})`); bad++; } }
  return [bad, cases.length];
}

// The scramble alphabet (hud.ts SCR) is drawn by ScrambleText, which writes innerHTML: a `<`, `>` or `&` in it comes out as an entity and the reveal slices it mid-way, so every HUD head
// and chapter 02's typing showed «&l», «lt;», «gt;» debris. The real fix is the alphabet; this keeps it that way.
function scrambleAlphabet(src) {
  const m = /export const SCR\s*=\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(src);
  if (!m) return ['hud.ts: the scramble alphabet SCR is gone'];
  const bad = [...new Set(m[2].match(/[<>&]/g) ?? [])];
  return bad.length ? [`hud.ts: SCR contains ${bad.join(' ')}: ScrambleText writes innerHTML, so these come out as entities and its reveal slices them mid-way (the «&l» / «lt;» debris); use ‹ › for the look`] : [];
}
function scrambleAlphabetSelfTest(src) {
  if (scrambleAlphabet(src).length) return [0, 0];                   // the real file is judged by the run below
  const cases = [
    ['an angle bracket back in the scramble alphabet', src.replace("'01·—/‹›ABCDEF'", "'01·—/<>ABCDEF'"), /SCR contains < >/],
    ['an ampersand in the scramble alphabet', src.replace("'01·—/‹›ABCDEF'", "'01·—/&ABCDEF'"), /SCR contains &/],
    ['the scramble alphabet gone', src.replace('export const SCR', 'export const SCRX'), /SCR is gone/],
  ];
  let bad = 0; for (const [what, m, expect] of cases) { if (m === src) { console.error(`FAIL self-test: the mutation "${what}" changed nothing`); bad++; continue; } if (!scrambleAlphabet(m).some((g) => expect.test(g))) { console.error(`FAIL self-test: scrambleAlphabet does not catch "${what}"`); bad++; } }
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
// `/` is another page and another gate's business, but the footer wordmark is /v3's: `/` is fetched once and must not carry it (and the rule must be able to fail on a copy that does)
let rootPage = '';
try { const r = await fetch(`${BASE}/`); if (!r.ok) throw new Error(`HTTP ${r.status}`); rootPage = await r.text(); } catch (e) { console.error(`FAIL cannot fetch ${BASE}/ (${e.message})`); process.exit(1); }
{
  const planted = rootPage.replace('</body>', '<div class="wmk" data-fx="wordmark" aria-hidden="true"></div></body>'); mutantCount++;
  if (planted === rootPage || !rootRule(planted).length) { console.error('FAIL self-test: the gate does not catch the footer wordmark planted on `/`'); fail++; }
  for (const m of rootRule(rootPage)) { console.error(`FAIL /: ${m}`); fail++; }
}
const mainSrc = readFileSync(new URL('../src/aegis/main.ts', import.meta.url), 'utf8');
{ const [bad, n] = engineBootSelfTest(mainSrc); fail += bad; mutantCount += n; }
for (const m of engineBoot(mainSrc)) { console.error(`FAIL main.ts: ${m}`); fail++; }
const hudSrc = readFileSync(new URL('../src/aegis/hud.ts', import.meta.url), 'utf8');
{ const [bad, n] = scrambleAlphabetSelfTest(hudSrc); fail += bad; mutantCount += n; }
for (const m of scrambleAlphabet(hudSrc)) { console.error(`FAIL hud.ts: ${m}`); fail++; }
const fxFiles = Object.fromEntries(FX_MODULES.map((n) => { try { return [n, readFileSync(new URL(`../src/aegis/fx/${n}`, import.meta.url), 'utf8')]; } catch { return [n, undefined]; } }));
{ const [bad, n] = fxSourceSelfTest(fxFiles); fail += bad; mutantCount += n; }
for (const m of fxSource(fxFiles)) { console.error(`FAIL fx: ${m}`); fail++; }
for (const lang of LANGS) {
  const html = pages.get(`${lang}/none`);
  fail += selfTest(html, lang); mutantCount += mutants(html, lang).length;
  for (const t of [deltaSelfTest, tokensSelfTest, chatSelfTest, sharpSelfTest]) { const [bad, n] = t(html, lang); fail += bad; mutantCount += n; }
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
