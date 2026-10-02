// Copy gate for /v3 (owner's rules, each one a real past failure).
//   BASE=http://127.0.0.1:4321 node web/scripts/v3-copy-check.mjs
// Fetches the SERVER-RENDERED page in both languages and fails (exit 1) on any
// forbidden phrase. Numbers outside the course's allowed set are listed as NOTE
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
let fail = 0;
for (const lang of ['es', 'en']) {
  let html;
  try {
    const r = await fetch(`${BASE}/v3`, { headers: { cookie: `pref_lang=${lang}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  } catch (e) { console.error(`FAIL ${lang}: cannot fetch ${BASE}/v3 (${e.message})`); process.exit(1); }
  if (!/<meta name="robots" content="noindex/.test(html)) { console.error(`FAIL ${lang}: no noindex`); fail++; }
  if (/connect\.facebook\.net|fbq\(|facebook\.com\/tr/.test(html)) { console.error(`FAIL ${lang}: Meta Pixel present`); fail++; }
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
  // the one sentence the owner mandated contains a city; it is the tokenizer example, not a place claim
  const t2 = text.replace(/Cartagena (es hermosa|is beautiful)/g, '');
  if (/Cartagena/i.test(t2)) { console.error(`FAIL ${lang}: city "Cartagena" outside the tokenizer example`); fail++; }
  for (const re of FORBIDDEN) { const m = t2.match(re); if (m) { console.error(`FAIL ${lang}: forbidden /${re.source}/ -> "${m[0]}"`); fail++; } }
  const nums = [...new Set((t2.match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => n.replace(/[.,]$/, '')))].filter((n) => !ALLOWED_NUM.has(n));
  console.log(`${lang}: NOTE numbers outside the allowed set: ${nums.join(' ') || '(none)'}`);
}
if (fail) { console.error(`v3-copy-check: ${fail} failure(s)`); process.exit(1); }
console.log('v3-copy-check: ok');
