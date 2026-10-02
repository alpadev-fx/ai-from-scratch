// Copy gate for /v3 (owner's rules, each one a real past failure).
//   BASE=http://127.0.0.1:4321 node web/scripts/v3-copy-check.mjs
// Fetches the SERVER-RENDERED page in both languages and fails (exit 1) on any
// forbidden phrase, AND on any required selling copy that is missing (a section
// silently dropped is the same failure as a forbidden word kept). Numbers outside the course's allowed set are listed as NOTE
// (some are HUD figures that carry ILUSTRATIVO, some are live copy awaiting the
// owner's call). If the page cannot be fetched the gate FAILS, never skips.
const BASE = process.env.BASE ?? 'http://127.0.0.1:4321';
const FORBIDDEN = [
  /Kardashev/i, /singularidad|singularity/i, /Ω/, /OpenAI|Anthropic|labs grandes|big labs/i,
  /testimonio|testimonial/i, /cuenta regresiva|countdown/i, /EBOOK|VOL\. ?1|PORTADA|\bCOVER\b/,
  /Medell/i, /\bcursos\b|\bcourses\b/i, /estudiantes|students/i,
];
const ALLOWED_NUM = new Set(['12', '36', '39.990', '39,990', '30', '100.000', '100,000', '94', '23', '4', '70.000.000.000',
  '3', '5', '31', '100', '120.000', '120,000', '99', '18,615', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '07', '0.30']);
import { STR } from '../src/lib/i18n.ts';
import { preguntas, modulos } from '../src/data/landing.ts';
const decode = (x) => x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#x27;/g, "'");
const norm = (x) => decode(x).replace(/\s+/g, ' ').trim();
// The owner's three asks: the advantages, the tutorials / who and how, and that the course keeps growing.
const required = (lang) => {
  const P = STR[lang].pub.land, V = STR[lang].pub.v3;
  const mod = (n) => modulos(lang).find((m) => m.n === n);
  return [
    ['01 headline', `${P.heroH1a} ${P.heroH1b}`], ['01 sub', P.heroSub], ['01 cta', P.heroCta], ['01 micro', P.heroMicro],
    ['01 symptom 1', P.s1H], ['01 symptom 2', P.s2H], ['01 symptom 3', P.s3H], ['01 hud', V.cifra], ['01 hud', V.fuente], ['01 hud', V.ilus],
    ['delta headline', V.deltaH], ['delta sub', P.aD], ['delta lesson 05', mod('05').h], ['delta lesson 06', mod('06').h], ['delta lesson 08', mod('08').h], ['delta lesson 09', mod('09').h],
    ['02 title', P.sintH2], ['02 body', P.heroPitch],
    ['especimenes h2', P.espH2], ['indice h2', P.indH2], ['ventajas h2', P.llevasH2],
    ['ventajas', P.l1H], ['ventajas', P.l1D], ['ventajas', P.l2H], ['ventajas', P.l2D], ['ventajas', P.l3H], ['ventajas', P.l3D],
    ['quien fintech', P.preWhy2], ['quien harness h', P.l5H], ['quien harness d', P.l5D],
    ['curso vivo label', P.vivoLbl], ['curso vivo h', P.l4H], ['curso vivo body', V.vivoV],
    ['precio h2', P.preH2], ['precio nota', P.preNota], ['precio cta', P.preCta], ['precio garantia', P.preGar], ['precio terminos', P.preTerm],
    ['precio include 1', P.pre1], ['precio include 2', P.pre2], ['precio include 3', P.pre3],
    ['precio why 1', P.preWhy1], ['precio why 3', V.preWhy3V], ['precio why 4', P.preWhy4],
    ['faq h2', P.faqH2], ['cierre h2', P.cierreH2], ['cierre sub', P.cierreSub], ['cierre cta', P.cierreCta],
    ...preguntas(lang).flatMap((f, i) => [[`faq ${i + 1} q`, f.q], [`faq ${i + 1} a`, i === 3 ? V.faqIncluyeA : f.a]]),
  ];
};
let fail = 0;
// The narrative changes with the visitor's market (the Colombian one carries a city), so every
// market is fetched: a city that only shows for one market is the failure this gate exists for.
const MARKETS = [null, 'CO', 'US', 'MX', 'ES', 'JP'];
for (const lang of ['es', 'en']) for (const cc of MARKETS) {
  const tag = `${lang}/${cc ?? 'none'}`;
  let html;
  try {
    const r = await fetch(`${BASE}/v3`, { headers: { cookie: `pref_lang=${lang}`, ...(cc ? { 'cf-ipcountry': cc } : {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  } catch (e) { console.error(`FAIL ${tag}: cannot fetch ${BASE}/v3 (${e.message})`); process.exit(1); }
  if (!/<meta name="robots" content="noindex/.test(html)) { console.error(`FAIL ${tag}: no noindex`); fail++; }
  if (/connect\.facebook\.net|fbq\(|facebook\.com\/tr/.test(html)) { console.error(`FAIL ${tag}: Meta Pixel present`); fail++; }
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
  // the one sentence the owner mandated contains a city; it is the tokenizer example, not a place claim
  const t2 = text.replace(/Cartagena (es hermosa|is beautiful)/g, '');
  if (/Cartagena/i.test(t2)) { console.error(`FAIL ${tag}: city "Cartagena" outside the tokenizer example`); fail++; }
  for (const re of FORBIDDEN) { const m = t2.match(re); if (m) { console.error(`FAIL ${tag}: forbidden /${re.source}/ -> "${m[0]}"`); fail++; } }
  for (const id of ['c01', 'c02', 'cL', 'especimenes', 'indice', 'ventajas', 'quien', 'vivo', 'precio', 'faq'])
    if (!html.includes(`id="${id}"`)) { console.error(`FAIL ${tag}: section #${id} missing from the rendered page`); fail++; }
  const body = norm(text);
  for (const [what, str] of required(lang)) if (!body.includes(norm(str))) { console.error(`FAIL ${tag}: required copy missing (${what}): "${str.slice(0, 70)}"`); fail++; }
  // the preWhy2 fintech line must not be shown twice (bio plate only)
  const dup = body.split(norm(STR[lang].pub.land.preWhy2)).length - 1;
  if (dup !== 1) { console.error(`FAIL ${tag}: preWhy2 appears ${dup} times, expected 1`); fail++; }
  if (cc === null) {
    const nums = [...new Set((t2.match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => n.replace(/[.,]$/, '')))].filter((n) => !ALLOWED_NUM.has(n));
    console.log(`${lang}: NOTE numbers outside the allowed set: ${nums.join(' ') || '(none)'}`);
  }
}
console.log(`v3-copy-check: ${2 * MARKETS.length} renders checked (2 languages x ${MARKETS.length} markets)`);
if (fail) { console.error(`v3-copy-check: ${fail} failure(s)`); process.exit(1); }
console.log('v3-copy-check: ok');
