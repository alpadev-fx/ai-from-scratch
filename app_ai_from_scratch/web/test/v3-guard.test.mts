import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPriced, guard, guarded, violations, withoutCity } from '../src/aegis/copy-guard.ts';
import { STR } from '../src/lib/i18n.ts';
import { PRECIO_VISUAL } from '../src/lib/price.ts';
import { ctxOf, draw, softmax, tokenize } from '../src/aegis/specimens.ts';
import { candidatos, modulos } from '../src/data/landing.ts';
import { WORDMARK } from '../src/aegis/wordmark.ts';
import { KU, LAP, lap, lit } from '../src/aegis/fx/wordmark-phase.ts';
import { chipStrings, type ChipSources } from '../src/aegis/token-strings.ts';
import { piecesOf, show, wordsOf, type TokenFile } from '../src/aegis/tokens.ts';
import { ANSWERS, CURVE, DIALS, END, NODES, NODE_BUDGET, T, TRACK_NODES, VIZ, WEIGHTS, curveOf, dialAngles, figureInts, stackOf, weightHeights } from '../src/aegis/c05-data.ts';
import { DEFAULTS, LADDER, WHAT, createRatchet, type Step } from '../src/aegis/quality.ts';
import { ahead } from '../src/aegis/seq.ts';
import { followStep, glowAlpha, rng, squareFrame, squareGlow, toward, type Follow } from '../src/aegis/util.ts';
import { END as C12_END, GEO as C12_GEO, LAP as C12_LAP, LAPS, LAPS_END, NODES as C12_NODES, NODE_BUDGET as C12_BUDGET, T as C12_T, beat, loopOf, nodeCount, tickAt } from '../src/aegis/c12-data.ts';
import { NODE_BUDGET as C07_BUDGET, ROWS as C07_ROWS, T as C07_T, count as c07Count, fall as c07Fall, nodeCount as c07Nodes, plan as c07Plan } from '../src/aegis/c07-data.ts';
import { NODE_BUDGET as C09_BUDGET, T as C09_T, chip as c09Chip, flight as c09Flight, nodeCount as c09Nodes, plain as c09Plain, plan as c09Plan, title as c09Title, wrap as c09Wrap } from '../src/aegis/c09-data.ts';
import { CAP as C13_CAP, NODE_BUDGET as C13_BUDGET, PILE_SEED as C13_SEED, T as C13_T, nodeCount as c13Nodes, pileOf as c13Pile, plan as c13Plan, text as c13Text, unit as c13Unit, unitsOf as c13Units, type Geo as C13Geo, type UnitSpec as C13Spec } from '../src/aegis/c13-data.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';

test('guard throws on a city, on plural courses, and lets the tokenizer sentence through', () => {
  assert.throws(() => guard('t', 'Hecho en Medellín'), /forbidden/);
  assert.throws(() => guard('t', 'Made in Cartagena'), /forbidden/);
  assert.throws(() => guard('t', 'nuevos cursos incluidos'), /forbidden/);
  assert.throws(() => guard('t', 'new courses included'), /forbidden/);
  assert.equal(guard('t', 'Cartagena es hermosa'), 'Cartagena es hermosa');
  assert.equal(guard('t', 'Cartagena is beautiful'), 'Cartagena is beautiful');
  assert.equal(guard('t', 'el curso sigue creciendo'), 'el curso sigue creciendo');
});

// The two lines as lib/narrative.ts (market "co") writes them. narrative.ts itself cannot be imported by plain
// Node (extensionless import), so the literals are copied here; v3-copy-check.mjs proves the rendered page.
const CO = { es: 'Lo escribió una persona con nombre y correo, en Medellín.', en: 'Written by one person with a name and an email, in Medellín.' };

test('the Colombian narrative line passes once the city is cut, and only then', () => {
  for (const lang of ['es', 'en'] as const) {
    assert.throws(() => guard('raw', CO[lang]), /forbidden/);
    assert.doesNotThrow(() => guard('cut', withoutCity(CO[lang])));
    assert.ok(!/Medell/.test(withoutCity(CO[lang])));
  }
  assert.equal(withoutCity(CO.es), 'Lo escribió una persona con nombre y correo.');
  assert.equal(withoutCity(CO.en), 'Written by one person with a name and an email.');
});

test('every v3 variant string exists in both languages and passes the guard', () => {
  for (const lang of ['es', 'en'] as const) {
    const V = STR[lang].pub.v3;
    for (const k of ['vivoV', 'preWhy3V', 'faqIncluyeA'] as const) assert.doesNotThrow(() => guard(`${lang}.${k}`, V[k]));
  }
});

// ---------- stage 2A: the Hormozi chapters. Each rule must be able to fail, and its clean twin must pass. ----------
const BAD: Array<[string, string]> = [
  ['hormozi §0.4', 'Una singularidad cercana'], ['hormozi §0.4', 'a galactic journey'], ['hormozi §0.4', 'Más de 500 alumnos'], ['hormozi §0.4', 'Hyperspace jump'],
  ['hormozi §0.4', 'el universo del curso'], ['hormozi §0.4', 'warp speed'], ['hormozi §0.4', 'Paga una vez: pago único'], ['hormozi §0.4', 'Próximamente nuevos módulos'],
  ['hormozi §0.4', 'Coming soon'], ['hormozi §0.4', 'Kardashev scale'], ['hormozi §0.4', 'used by OpenAI engineers'], ['hormozi §0.4', 'a black hole of tokens'],
  ['old cover', 'EBOOK · VOL. 1'], ['old cover', 'FIG. 01 — PORTADA'],
  ['monthly', '$39.990/mes'], ['monthly', '$39.990 / mes'], ['monthly', 'Menos que un domicilio al mes'], ['monthly', 'Suscribirme · $39.990'], ['monthly', 'Suscripción mensual'],
  ['monthly', 'Dos formas de entrar'], ['monthly', '39,990 COP/month'], ['monthly', 'Everything for 39,990 COP a month'], ['monthly', 'Subscribe now'],
  ['monthly', 'Monthly subscription'], ['monthly', 'Two ways in'],
  ['twenty seconds', 'Creas tu cuenta — veinte segundos'], ['twenty seconds', 'Create your account in twenty seconds'],
  ['cat', 'Mi gato se llama…'], ['cat', "My cat's name is…"], ['cat', 'tres gatos'],
  ['testimonial', 'Mira los testimonios de otros'], ['testimonial', 'Read the testimonials'],
  ['city', 'Hecho en Cali'], ['city', 'Built in Bogotá'], ['city', 'Made in Cartagena'],
  ['plural', 'nuevos cursos incluidos'], ['plural', 'new courses included'],
];
test('each rule of the guard can fail', () => {
  for (const [what, txt] of BAD) {
    assert.ok(violations(txt).length > 0, `${what}: "${txt}" should be rejected`);
    assert.throws(() => guard('t', txt), /forbidden/, `${what}: guard must throw on "${txt}"`);
  }
});
test('the clean twins pass: the true «cada mes» of the opt-in renewal, "the month you already paid", subscription as a word, the lesson-01 cats', () => {
  const OK = [
    'Si la activas, Mercado Pago cobra 39.990 COP cada mes hasta que la canceles desde tu perfil, en un clic.',
    'Sigues entrando hasta el final del mes que ya pagaste.', 'You keep access until the end of the month you already paid for.',
    'Turn it on and Mercado Pago charges 39,990 COP every month until you cancel.', '¿Qué incluye la suscripción?', 'What does the subscription include?',
    'WHILE YOU STAY SUBSCRIBED', 'Todo lo que entra por $39.990 por 30 días.', 'Everything included for 39,990 COP for 30 days.', 'Cartagena es hermosa', 'Cartagena is beautiful',
    'Enseñada desde la frontera.', 'Taught from the frontier.', 'una fintech de Silicon Valley',
  ];
  for (const txt of OK) assert.deepEqual(violations(txt), [], `"${txt}" should pass`);
});
test('«testimonios» is allowed in ONE sentence only: the sanctioned one, in both languages, and nowhere else', () => {
  for (const lang of ['es', 'en'] as const) {
    const V = STR[lang].pub.v3;
    assert.doesNotThrow(() => guard(`${lang}.s5H`, V.s5H));
    assert.equal(V.s5H.match(/testimoni/gi)?.length, 1, `${lang}: the word appears exactly once in s5H`);
    assert.throws(() => guard('t', V.s5H + ' Mira estos testimonios.'));
    assert.throws(() => guard('t', 'Lee los testimonios. ' + V.s5H));
    assert.throws(() => guard('t', "More testimonials. " + V.s5H));
  }
  assert.ok(STR.es.pub.v3.s5H.startsWith('No te voy a mostrar testimonios.') && STR.en.pub.v3.s5H.startsWith("I won't show you testimonials."));
});
test('«gato»/«cat» passes only as the published lesson-01 text, named with allow', () => {
  for (const lang of ['es', 'en'] as const) {
    const m01 = modulos(lang).find((m) => m.n === '01')!;
    assert.throws(() => guard('m01', m01.h + m01.d + m01.k + m01.kc), /cat/);                // without the exemption it is caught
    assert.doesNotThrow(() => guard('m01', m01.h + m01.d + m01.k + m01.kc, { allow: [m01.kc] }));
    for (const m of modulos(lang)) if (m.n !== '01') assert.doesNotThrow(() => guard(`m${m.n}`, m.h + m.d + m.k + m.kc), `lesson ${m.n} says nothing about cats`);
    assert.throws(() => guard('m01', m01.kc + ' Mi gato se llama…', { allow: [m01.kc] }));  // the exemption covers that text and no other
  }
});

// Every string of pub.v3 is printed by the page (or by the client script), so every one of them must pass the guard once {precio} is filled.
const walk = (o: unknown, path: string, out: Array<[string, string]> = []): Array<[string, string]> => {
  if (typeof o === 'string') out.push([path, o]);
  else if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`, out);
  return out;
};
const fill = (s: string, lang: 'es' | 'en') => s.split('{precio}').join(PRECIO_VISUAL[lang]);
test('every pub.v3 string passes the guard in both languages, and both languages have the same strings', () => {
  const shape = (lang: 'es' | 'en') => walk(STR[lang].pub.v3, 'v3').map(([p]) => p);
  assert.deepEqual(shape('es'), shape('en'));
  for (const lang of ['es', 'en'] as const) for (const [p, s] of walk(STR[lang].pub.v3, `${lang}.v3`)) assert.doesNotThrow(() => guard(p, fill(s, lang)), p);
});
test('prices are placeholders, never literals, in the v3 strings; {precio} is filled with the shared PRECIO_VISUAL', () => {
  for (const lang of ['es', 'en'] as const) {
    for (const [p, s] of walk(STR[lang].pub.v3, `${lang}.v3`)) assert.ok(!/39[.,]?990|\$\s?\d/.test(s), `${p} carries a literal price`);
    const V = STR[lang].pub.v3;
    for (const s of [V.s7H, V.s7Gar.d, V.s8Body]) assert.ok(s.includes('{precio}'), `${lang}: "${s.slice(0, 40)}" must carry {precio}`);
    assert.ok(fill(V.s7H, lang).includes(PRECIO_VISUAL[lang]));
  }
});
test('prod facts: ONE product for 30 days. The offer headline says so, the closing step 1 drops the unpublished promise, item 6 reuses vivoV', () => {
  const es = STR.es.pub.v3, en = STR.en.pub.v3;
  assert.equal(es.s7H, 'Todo lo que entra por {precio} por 30 días.');
  assert.equal(en.s7H, 'Everything included for {precio} for 30 days.');
  assert.equal(es.s14Pasos[0], '1 · Creas tu cuenta, sin tarjeta.');
  assert.equal(en.s14Pasos[0], '1 · Create your account, no card.');
  assert.equal(es.s7Next, 'Lo que publique después');
  assert.equal(en.s7Next, 'Whatever I publish next');
  for (const V of [es, en]) assert.equal(V.s7Items.length + 2, 7, 'five Hormozi items + «lo que publique después» + the guarantee = seven');
  // the dog sentence of the published bD is the specimen context; the Hormozi cat prompt is not in any v3 string
  for (const lang of ['es', 'en'] as const) for (const [p, s] of walk(STR[lang].pub.v3, 'v3')) assert.ok(!/\bgatos?\b|\bcat'?s?\b|se llama…|name is…/i.test(s), `${lang} ${p} mentions the cat prompt`);
  assert.ok(/perro/.test(STR.es.pub.land.bD) && /dog/.test(STR.en.pub.land.bD));
});
// ---------- the price guard of the page ----------
// v3.astro calls assertPriced() on the two paid buttons (pub.land.preCta, pub.land.cierreCta) while it renders, and it THROWS unless each one carries the
// published price. Those two labels are literals in i18n.ts, outside pub.v3, so a price that moves in PRECIO_VISUAL (and in every string that uses {precio})
// while they keep the old number is not caught by scripts/check-price.mjs (its forward check passes and nobody adds the old number to STALE): the page
// would answer 500 on every request and every gate in the fast `pnpm verify` would stay green. This runs in that gate, with the page's own strings.
test('the two paid buttons carry the published price in both languages: otherwise /v3 answers 500 on every request', () => {
  for (const lang of ['es', 'en'] as const) {
    const P = STR[lang].pub.land, price = PRECIO_VISUAL[lang];
    assert.ok(price, `${lang}: there is a published price`);
    assert.doesNotThrow(() => assertPriced('pub.land.preCta', P.preCta, price), `${lang}: preCta "${P.preCta}" must carry "${price}"`);
    assert.doesNotThrow(() => assertPriced('pub.land.cierreCta', P.cierreCta, price), `${lang}: cierreCta "${P.cierreCta}" must carry "${price}"`);
  }
});
test('assertPriced can fail: the price moved and the button kept the old number, no price, the other language\'s notation, no published price', () => {
  for (const lang of ['es', 'en'] as const) {
    const P = STR[lang].pub.land, price = PRECIO_VISUAL[lang], other = PRECIO_VISUAL[lang === 'es' ? 'en' : 'es'];
    const moved = price.replace(/\d/g, (d) => String((+d + 1) % 10));       // the same notation with every digit changed: a price that moved
    assert.notEqual(moved, price);
    for (const [key, label] of [['preCta', P.preCta], ['cierreCta', P.cierreCta]] as const) {
      assert.ok(label.includes(price), `${lang}.${key} carries the price, so the cases below change something real`);
      assert.throws(() => assertPriced(key, label, moved), /does not carry the published price/, `${lang}.${key}: a moved price`);
      assert.throws(() => assertPriced(key, label.replace(price, ''), price), /does not carry the published price/, `${lang}.${key}: no price`);
      assert.throws(() => assertPriced(key, label.replace(price, other), price), /does not carry the published price/, `${lang}.${key}: the other language's notation`);
      assert.throws(() => assertPriced(key, label, ''), /does not carry the published price/, `${lang}.${key}: no published price`);
    }
  }
});
test('guarded() checks a string at the moment it is read, in nested objects and arrays', () => {
  const o = guarded({ ok: 'hola', list: ['a', 'b'], deep: { bad: 'Hecho en Medellín', fine: 'x' }, items: [{ t: 'ok', d: 'pago único' }] }, 'o');
  assert.equal(o.ok, 'hola'); assert.equal(o.list[1], 'b'); assert.equal(o.deep.fine, 'x'); assert.equal(o.list.length, 2);
  assert.deepEqual(o.list.map((x) => x.toUpperCase()), ['A', 'B']);
  assert.throws(() => o.deep.bad, /forbidden city/);
  assert.equal(o.items[0].t, 'ok');
  assert.throws(() => o.items[0].d, /forbidden/);
});

// ---------- «Pídele un nombre»: a draw from the distribution the bars show ----------
test('draw(): slice boundaries, the top of the interval, and every way an input can be wrong', () => {
  const pr = [0.5, 0.3, 0.2];
  assert.equal(draw(pr, 0), 0); assert.equal(draw(pr, 0.4999), 0); assert.equal(draw(pr, 0.5), 1);
  assert.equal(draw(pr, 0.7999), 1); assert.equal(draw(pr, 0.8), 2); assert.equal(draw(pr, 0.999999999), 2);
  assert.equal(draw([0.3, 0.3, 0.3], 0.999999), 2);                       // float rounding: the sum is 0.9, the last slice absorbs the rest
  for (const r of [1, 1.0001, -0.0001, NaN, Infinity]) assert.throws(() => draw(pr, r), RangeError, `r=${r}`);
  assert.throws(() => draw([], 0.5), RangeError);
  assert.throws(() => draw([0.5, NaN], 0.1), RangeError);
  assert.throws(() => draw([0.5, -0.1, 0.6], 0.1), RangeError);
  assert.throws(() => draw([Infinity, 0], 0.1), RangeError);
});
test('draw() over the published candidates: cold plays safe, hot spreads, and it only ever returns a published name', () => {
  for (const lang of ['es', 'en'] as const) {
    const cands = candidatos(lang), names = new Set(cands.map((c) => c.name));
    const share = (T: number) => { const pr = softmax(cands, T); let first = 0; const N = 2000; for (let k = 0; k < N; k++) { const i = draw(pr, (k + 0.5) / N); assert.ok(names.has(cands[i].name)); if (i === 0) first++; } return first / N; };
    const cold = share(0.1), mid = share(1), hot = share(1.8);
    assert.ok(cold > 0.97, `T=0.1: Max ${cold}`); assert.ok(cold > mid && mid > hot, `${cold} > ${mid} > ${hot}`); assert.ok(hot < 0.5, `T=1.8: Max ${hot}`);
  }
});

// The Δ chapter shows the sampled token (Max, Luna…) after the context those candidates answer: specimen B's («Le pediste un
// nombre para tu perro.»), never after the specimen-A sentence («Cartagena es hermosa»). The context is a CUT of the published
// bD string, so no new copy exists to drift; these tests pin the cut and that the two contexts stay different.
test('ctxOf cuts the first sentence of specimen B out of the published string', () => {
  assert.equal(ctxOf(STR.es.pub.land.bD), 'Le pediste un nombre para tu perro.');
  assert.equal(ctxOf(STR.en.pub.land.bD), 'You asked it to name your dog.');
  assert.equal(ctxOf('Sin punto intermedio'), 'Sin punto intermedio');   // no ". " inside: the whole string, never empty
  assert.equal(ctxOf('  Una. Dos. '), 'Una.');
  assert.equal(ctxOf(''), '');
  for (const lang of ['es', 'en'] as const) {
    const bD = STR[lang].pub.land.bD, c = ctxOf(bD);
    assert.ok(c.length > 0 && c.length < bD.length && bD.startsWith(c) && c.endsWith('.'), `${lang}: context must be a proper prefix of bD`);
    assert.doesNotThrow(() => guard(`${lang}.deltaContext`, c));
  }
});

test('the candidate context is not the Cartagena sentence', () => {
  for (const lang of ['es', 'en'] as const) {
    const P = STR[lang].pub.land, c = ctxOf(P.bD);
    assert.notEqual(c, P.aEjemplo);
    assert.ok(!c.includes('Cartagena') && !P.aEjemplo.includes(c));
    assert.ok(c.split(/\s+/).filter(Boolean).length >= 3);              // the context row needs words to carry attention
  }
});

test('the dial\'s fixed draw only ever lands on a published candidate, and temperature moves it down the list', () => {
  for (const lang of ['es', 'en'] as const) {
    const cands = candidatos(lang), U0 = 0.62;
    const pick = (T: number) => { const pr = softmax(cands, T); let c = 0; for (let i = 0; i < pr.length; i++) { c += pr[i]; if (U0 <= c) return i; } return 0; };
    const lo = pick(0.3), hi = pick(1.6);
    assert.equal(cands[lo].name, 'Max');                                   // cold: the likeliest
    assert.ok(hi >= lo && cands[hi]);                                      // hot: same draw, further down the list
    for (let T = 0.3; T <= 1.6001; T += 0.05) assert.ok(pick(T) >= 0 && pick(T) < cands.length);
  }
});

// ---------- real tokens (o200k_base, GPT-4o): every chip on /v3 ----------
// Chapter 04's rows and the chips the stage-2B effects move are NOT cut by the page's heuristic: they are the tokens the vocabulary really gives, cut once with tiktoken by
// web/scripts/v3-tokens.py and committed in src/data/v3-tokens.json (pieces and ids, ES and EN). Node cannot run tiktoken, so what this proves is that the file is IN SYNC with the
// strings: a copy change without a regenerated file is red, and a chip consumer that goes back to the heuristic is red. The pieces themselves are real because that script made them.
const TOKENS = JSON.parse(readFileSync(new URL('../src/data/v3-tokens.json', import.meta.url), 'utf8')) as TokenFile;
const chipSources = (lang: 'es' | 'en'): ChipSources => ({ P: STR[lang].pub.land, V: STR[lang].pub.v3, mods: modulos(lang), price: PRECIO_VISUAL[lang], ctx: ctxOf(STR[lang].pub.land.bD), cands: candidatos(lang) });
test('every string shown as a chip has its real o200k tokens in v3-tokens.json, the pieces join back into it, and the file holds nothing else', () => {
  assert.equal(TOKENS.encoding, 'o200k_base');
  assert.match(TOKENS.library, /^tiktoken \d/);
  for (const lang of ['es', 'en'] as const) {
    const want = chipStrings(chipSources(lang));
    assert.ok(want.length >= 29, `${lang}: the list of chip strings shrank to ${want.length}`);
    for (const { id, text } of want) {
      const p = TOKENS[lang][text];
      assert.ok(p && p.length, `${lang} ${id}: «${text}» has no real tokens: run  uv run --with tiktoken python3 web/scripts/v3-tokens.py`);
      assert.equal(p.map((x) => x[0]).join(''), text, `${lang} ${id}: the pieces do not join back into the string (it changed: regenerate the file)`);
      for (const [t, ...ids] of p) { assert.ok(t.length > 0, `${lang} ${id}: an empty piece`); assert.ok(ids.length >= 1 && ids.every((n) => Number.isInteger(n) && n >= 0), `${lang} ${id}: a piece without a token id`); }
      assert.doesNotThrow(() => piecesOf(TOKENS[lang], text));
    }
    assert.deepEqual(Object.keys(TOKENS[lang]).sort(), [...new Set(want.map((c) => c.text))].sort(), `${lang}: the file has entries for strings that are not chips any more (regenerate it)`);
  }
});
test('piecesOf fails closed: a string that is not in the file, or pieces that no longer join into it, throws', () => {
  const m = TOKENS.es;
  assert.throws(() => piecesOf(m, 'Una frase que no es un chip'), /no real tokens/);
  assert.throws(() => piecesOf({ 'Hola mundo': [['Hola', 1], [' mund', 2]] }, 'Hola mundo'), /do not join back/);
  assert.throws(() => piecesOf({ x: [] }, 'x'), /no real tokens/);
  assert.equal(piecesOf(m, 'Cartagena es hermosa').length, 4);
});
test('show() writes a middle dot for a leading space, and wordsOf() numbers the words of a cut', () => {
  assert.equal(show(' es'), '·es'); assert.equal(show('Cart'), 'Cart'); assert.equal(show('.'), '.'); assert.equal(show(' '), '·');
  const p = piecesOf(TOKENS.es, 'Le pediste un nombre para tu perro.');
  assert.deepEqual(p.map((x) => x[0]), ['Le', ' ped', 'iste', ' un', ' nombre', ' para', ' tu', ' perro', '.']);   // real o200k pieces, pinned: a different vocabulary is a decision for this page
  assert.deepEqual(wordsOf(p), [0, 1, 1, 2, 3, 4, 5, 6, 6]);
  assert.equal(Math.max(...wordsOf(p)) + 1, STR.es.pub.land.bD.split('. ')[0].split(/\s+/).length);   // as many words as the context has
  assert.deepEqual(wordsOf([]), []);
  const e = piecesOf(TOKENS.en, 'You asked it to name your dog.');
  assert.equal(Math.max(...wordsOf(e)) + 1, 7);
});
test('chapter 04 row A is the real cut of the example sentence, and the heuristic is gone from the c04 data path', () => {
  const es = piecesOf(TOKENS.es, STR.es.pub.land.aEjemplo).map((x) => x[0]), en = piecesOf(TOKENS.en, STR.en.pub.land.aEjemplo).map((x) => x[0]);
  assert.deepEqual(es, ['Cart', 'agena', ' es', ' hermosa']);
  assert.deepEqual(en, ['Cart', 'agena', ' is', ' beautiful']);
  // the free-typing box of chapter 08 keeps its heuristic, and says so: its cut is NOT the real one (it is labelled ILUSTRATIVO)
  assert.deepEqual(tokenize(STR.es.pub.land.aEjemplo), ['Carta', 'gena', 'es', 'hermo', 'sa']);
  assert.notDeepEqual(tokenize(STR.es.pub.land.aEjemplo).map((t) => t), es.map((t) => t.trim()));
  assert.deepEqual(tokenize('x '.repeat(40)).length, 26);                               // the heuristic's own 26-piece cap, unchanged
});
test('chapter 04: the predicted chip is a real o200k token with its leading space marked («·Max»), whichever candidate the dial picks, and neither the page nor the dial prints a bare name', () => {
  for (const lang of ['es', 'en'] as const) {
    const file = TOKENS[lang], cands = candidatos(lang);
    const chip = (name: string) => show(piecesOf(file, ' ' + name)[0][0]);       // what the page and llm.ts print: the FIRST token of the name behind the context
    assert.equal(chip(cands[0].name), '·Max', `${lang}: the chip the page renders before the dial moves`);
    for (const c of cands) {
      const first = piecesOf(file, ' ' + c.name)[0][0];
      assert.ok(first.startsWith(' ') && first.length > 1, `${lang} «${c.name}»: after the context the next token carries its leading space`);
      assert.ok(chip(c.name).startsWith('·') && !chip(c.name).includes(' '), `${lang} «${c.name}»: the chip marks that space with «·», like every chip of the row`);
      assert.ok(' ' + c.name === piecesOf(file, ' ' + c.name).map((x) => x[0]).join(''), `${lang} «${c.name}»: its pieces join back into the string`);
    }
  }
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8');
  const bare = (p: string, l: string) => /<b>\{cands\[0\]\.name\}<\/b>/.test(p) || /\.textContent = cands\[win\]\.name/.test(l);
  assert.ok(!bare(page, llm), 'the predicted chip prints a candidate\'s bare name: it is a token, and a token after the context starts with a space');
  // the rule can fail
  assert.ok(bare('<div class="tk ans"><b>{cands[0].name}</b></div>', ''));
  assert.ok(bare('', "b.textContent = cands[win].name; }"));
});
// Nothing that shows chips may cut text by the heuristic. The ONLY caller allowed is specimens.ts itself (the free-typing box of chapter 08) and the one line of v3.astro that
// renders that box's first picture, marked ILLUSTRATIVE.
const walkFiles = (dir: URL, out: URL[] = []): URL[] => { for (const n of readdirSync(dir)) { const u = new URL(n + (statSync(new URL(n, dir)).isDirectory() ? '/' : ''), dir); if (n.endsWith('/')) continue; if (statSync(u).isDirectory()) walkFiles(u, out); else if (/\.(ts|astro)$/.test(n)) out.push(u); } return out; };
const noComments = (src: string) => src.replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');   // line comments first: «src/aegis/*» inside one is not the start of a block
test('no chip consumer calls tokenize(): only the free-typing specimen of chapter 08 does (and chapter 04 reads the real tokens)', () => {
  const root = new URL('../src/', import.meta.url);
  const files = [...walkFiles(new URL('aegis/', root)), new URL('pages/v3.astro', root)];
  const callers = files.filter((u) => /\btokenize\s*\(/.test(noComments(readFileSync(u, 'utf8')))).map((u) => u.pathname.split('/src/')[1]).sort();
  assert.deepEqual(callers, ['aegis/specimens.ts', 'pages/v3.astro'], `tokenize() is called from: ${callers.join(', ')}`);
  const page = readFileSync(new URL('pages/v3.astro', root), 'utf8');
  const lines = page.split('\n').filter((l) => /\btokenize\s*\(/.test(noComments(l)));
  assert.equal(lines.length, 1, 'v3.astro calls tokenize() once');
  assert.match(lines[0], /illusToks/, 'and that call is the illustrative first picture of specimen A');
  assert.ok(!files.some((u) => /\bctxChips\b/.test(readFileSync(u, 'utf8'))), 'ctxChips (the heuristic context row) is gone');
  assert.match(page, /<div class="ph">\{V\.ilus\}<\/div>\s*<div id="tokens"/, 'specimen A carries the ILUSTRATIVO tag right above its chips');
});
test('the factual source label of the chips is in both languages and says what they are', () => {
  assert.equal(STR.es.pub.v3.tokReal, 'TOKENS REALES · o200k (GPT-4o)');
  assert.equal(STR.en.pub.v3.tokReal, 'REAL TOKENS · o200k (GPT-4o)');
  for (const lang of ['es', 'en'] as const) assert.doesNotThrow(() => guard(`${lang}.tokReal`, STR[lang].pub.v3.tokReal));
});

// ---------- the footer wordmark: the outlines of «AI FROM SCRATCH» (web/scripts/v3-wordmark.py writes src/aegis/wordmark.ts) ----------
// The module is generated, so the test reads the paths the way a browser does (the compact grammar the generator writes: M, then relative h v l q c, z) and proves what the page depends on:
// the text, 18 contours in each layout, every point inside the box the page reserves, and `lc`, the length of each contour (the effect sizes and times the runners by them), is the real one.
type Pt = [number, number];
function contoursOf(d: string): Pt[][] {
  const out: Pt[][] = []; let cur: Pt[] = [], x = 0, y = 0, sx = 0, sy = 0, cmd = '';
  const arity: Record<string, number> = { M: 2, h: 1, v: 1, l: 2, q: 4, c: 6, z: 0 };
  const toks = d.match(/[MhvlqcZz]|-?\d+(?:\.\d+)?/g) ?? [];
  assert.equal(toks.join(''), d.replace(/\s+/g, ''), 'the path holds only the commands and numbers the generator writes');
  for (let i = 0; i < toks.length;) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++].replace('Z', 'z'); else assert.ok(cmd && cmd !== 'z' && cmd !== 'M', 'a number with no command to repeat');
    const n = arity[cmd]; assert.ok(n !== undefined, `unknown command ${cmd}`);
    if (cmd === 'z') { cur.push([sx, sy]); out.push(cur); cur = []; x = sx; y = sy; continue; }
    const a = toks.slice(i, i + n).map(Number); assert.equal(a.length, n, `${cmd} needs ${n} numbers`); i += n;
    if (cmd === 'M') { x = sx = a[0]; y = sy = a[1]; cur = [[x, y]]; cmd = 'l'; }              // numbers after an M are lineto's, but the generator never writes them
    else if (cmd === 'h') { x += a[0]; cur.push([x, y]); }
    else if (cmd === 'v') { y += a[0]; cur.push([x, y]); }
    else if (cmd === 'l') { x += a[0]; y += a[1]; cur.push([x, y]); }
    else if (cmd === 'q') { const [cx, cy, ex, ey] = [x + a[0], y + a[1], x + a[2], y + a[3]]; for (let k = 1; k <= 32; k++) { const t = k / 32; cur.push([(1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * ey]); } x = ex; y = ey; }
    else { const [c1x, c1y, c2x, c2y, ex, ey] = [x + a[0], y + a[1], x + a[2], y + a[3], x + a[4], y + a[5]]; for (let k = 1; k <= 32; k++) { const t = k / 32; cur.push([(1 - t) ** 3 * x + 3 * (1 - t) ** 2 * t * c1x + 3 * (1 - t) * t * t * c2x + t ** 3 * ex, (1 - t) ** 3 * y + 3 * (1 - t) ** 2 * t * c1y + 3 * (1 - t) * t * t * c2y + t ** 3 * ey]); } x = ex; y = ey; }
  }
  assert.equal(cur.length, 0, 'every contour is closed (z)');
  return out;
}
const lengthOf = (c: Pt[]) => c.reduce((s, p, i) => s + Math.hypot(p[0] - c[(i + 1) % c.length][0], p[1] - c[(i + 1) % c.length][1]), 0);

test('the wordmark says AI FROM SCRATCH, in one line and in two, from 18 closed contours each', () => {
  assert.equal(WORDMARK.text, 'AI FROM SCRATCH');
  assert.equal(WORDMARK.lines.join(' '), WORDMARK.text);
  // A(2) I F R(2) O(2) M · S C R(2) A(2) T C H: the letters' outlines and their counters
  for (const k of ['one', 'two'] as const) assert.equal(contoursOf(WORDMARK[k].d).length, WORDMARK.contours, `${k}: contours`);
  assert.equal(WORDMARK.contours, 18);
  assert.ok(WORDMARK.one.w / WORDMARK.one.h > 8, 'one line is a wide band');
  assert.ok(WORDMARK.two.w / WORDMARK.two.h > 1.5 && WORDMARK.two.w / WORDMARK.two.h < 4, 'two lines are a block');
  assert.ok(WORDMARK.two.h > 2 * WORDMARK.two.cap, 'the two-line layout holds two lines (it is taller than two caps)');
});

test('every point of the wordmark is inside the box the page reserves for it (the viewBox is the ink, so the box has its aspect ratio from the first paint)', () => {
  for (const k of ['one', 'two'] as const) {
    const m = WORDMARK[k], pts = contoursOf(m.d).flat();
    const [x0, y0, x1, y1] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    assert.ok(x0 >= -1 && y0 >= -1 && x1 <= m.w + 1 && y1 <= m.h + 1, `${k}: ink ${x0.toFixed(1)},${y0.toFixed(1)} → ${x1.toFixed(1)},${y1.toFixed(1)} inside 0,0 → ${m.w},${m.h}`);
    assert.ok(x1 - x0 >= m.w - 2 && y1 - y0 >= m.h - 2, `${k}: the box is the ink, not bigger (a loose box would shift the mark off the page's edges)`);
  }
});

test('`lc` lists the real length of each contour, in the order of the path, in both layouts', () => {
  for (const k of ['one', 'two'] as const) {
    const real = contoursOf(WORDMARK[k].d).map(lengthOf), lc = WORDMARK[k].lc;
    assert.equal(lc.length, real.length, `${k}: one length per contour`);
    real.forEach((r, i) => assert.ok(Math.abs(r - lc[i]) / r < 0.01, `${k}: contour ${i}: lc ${lc[i]} vs ${r.toFixed(0)}`));
  }
});

// The footer's runners: every contour has its own, on its own phase, so lines are ALWAYS running somewhere on the mark (the AEGIS footer starts every contour together and leaves the mark
// empty for part of each lap: the owner looked in a gap and saw nothing). The phases are a pure function of the lengths, so the promise is provable without a browser.
test('there are always runners lit on the wordmark: at every instant of the lap, in both layouts, at least floor(S) contours are lit', () => {
  for (const k of ['one', 'two'] as const) {
    const l = lap(WORDMARK[k].lc);
    assert.ok(l.cover >= 4, `${k}: the windows cover the lap ${l.cover.toFixed(2)} times (at least 4)`);
    assert.ok(l.starts.every((s) => s >= 0 && s < LAP), `${k}: every phase is inside the lap`);
    let min = Infinity, max = 0;
    for (let i = 0; i < 4000; i++) { const n = lit(l, (i / 4000) * LAP); min = Math.min(min, n); max = Math.max(max, n); }
    assert.ok(min >= Math.floor(l.cover) - 0, `${k}: at least ${Math.floor(l.cover)} lit at every instant (min ${min}, max ${max})`);
    assert.ok(min >= 4, `${k}: never fewer than 4 runners (min ${min})`);
  }
});

test('the measure of the runners can fail: every contour starting together (the AEGIS footer) leaves the mark empty, and a pattern too long does too', () => {
  const lc = WORDMARK.one.lc, l = lap(lc), together = { ...l, starts: l.starts.map(() => 0) };
  const gap = (x: typeof l, ku = KU) => { let min = Infinity; for (let i = 0; i < 4000; i++) min = Math.min(min, lit(x, (i / 4000) * LAP)); return min; };
  assert.equal(gap(together), 0, 'synchronized runners: a part of the lap with nothing lit');
  assert.ok(gap(lap(lc, 12)) < 3, 'a pattern 12 longest contours long is lit too rarely');
  assert.ok(gap(l) >= 4);
});

test('the wordmark names its font and its OFL licence, the file header says the same, and SF Pro is not the source', () => {
  const f = WORDMARK.font, src = readFileSync(new URL('../src/aegis/wordmark.ts', import.meta.url), 'utf8');
  assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.match(f.commit, /^[0-9a-f]{40}$/);
  assert.match(f.license, /Open Font License/);
  assert.ok(/^\/\/ GENERATED by web\/scripts\/v3-wordmark\.py/.test(src), 'the file says it is generated');
  for (const s of [f.sha256, f.license, f.copyright, f.name]) assert.ok(src.split('\n').slice(0, 12).join('\n').includes(s), `the header names ${s}`);
  assert.ok(!/SF Pro|San Francisco/i.test(f.name + f.path + f.source));
  const gen = readFileSync(new URL('../scripts/v3-wordmark.py', import.meta.url), 'utf8');
  assert.ok(gen.includes(f.sha256) && gen.includes(f.commit), 'the generator pins the same font (commit and sha256)');
  assert.ok(/got = hashlib\.sha256\(data\)\.hexdigest\(\)\s+if got != FONT\['sha256'\]:\s+die\(f"the font is not the pinned one/.test(gen), 'the generator fails closed on a font that is not the pinned one');
});

// ---------- the hero's footage (c01): the packs on disk are the packs the code counts, and what made it flicker stays out ----------
test('the hero frame packs on disk are exactly the ones c01.ts counts (a short pack leaves the scrub on a stale frame, a long one is bytes nobody sees)', () => {
  const src = readFileSync(new URL('../src/aegis/c01.ts', import.meta.url), 'utf8');
  const n2 = Number(/const N2_FRAMES = (\d+)/.exec(src)?.[1]), len = /const len1 = variant === 'm' \? (\d+) : (\d+)/.exec(src);
  assert.ok(n2 > 0 && len, 'c01.ts keeps its frame counts where this test looks for them');
  const want: Array<[string, number]> = [['n1/d', Number(len![2])], ['n1/m', Number(len![1])], ['n2/d', n2], ['n2/m', n2]];
  for (const [dir, n] of want) {
    const files = readdirSync(new URL(`../public/v3/seq/${dir}/`, import.meta.url)).filter((f) => f.endsWith('.webp')).sort();
    assert.equal(files.length, n, `${dir} has ${files.length} frames and c01.ts says ${n}`);
    files.forEach((f, i) => assert.equal(f, String(i + 1).padStart(4, '0') + '.webp', `${dir}: the frames run 0001... without a gap (${f} at ${i})`));
  }
});

test('the hero cannot flicker the way it did: the grain is the same on every frame, and the join between the two clips is a plain dissolve', () => {
  const eng = readFileSync(new URL('../src/aegis/engine.ts', import.meta.url), 'utf8'), c01 = readFileSync(new URL('../src/aegis/c01.ts', import.meta.url), 'utf8');
  const grain = (t: string) => /float g = \(h21\([^;]*;/.exec(t)?.[0] ?? '', glitch = (t: string) => /glitch:[^\n]*/.exec(t)?.[0] ?? '';
  assert.ok(grain(eng), 'the finishing pass still has its grain line');
  assert.ok(!/time/.test(grain(eng)), 'grain re-drawn on every frame shimmers on a picture that is not moving');
  assert.ok(glitch(c01) && !/joinB/.test(glitch(c01)), 'a glitch on the join is a flash on the first frame of the second clip');
  // the two rules can fail
  assert.ok(/time/.test(grain('float g = (h21(vUv * res * 1.31 + fract(time * 13.37) * 173.0) - 0.5) * grain;')));
  assert.ok(/joinB/.test(glitch('      glitch: 0.55 * shatter + 1.0 * joinB,')));
});

// ---------- phones: the unscrolled page is never wider than the screen ----------
test('the unscrolled hero cannot be stretched by its buttons: the phone grid track has a zero minimum and the labels wrap where the pair does not fit', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8');
  const track = (t: string) => /@media \(max-width:900px\)\{#c01 \.stage\{grid-template-columns:([^}]*)\}/.exec(t)?.[1];
  assert.equal(track(css), 'minmax(0,1fr)', 'a bare 1fr is minmax(auto,1fr): the widest unbreakable label sets the column (354px at a 320px viewport)');
  assert.ok(/@media \(max-width:359px\)\{\.buy\{white-space:normal/.test(css), 'below 360 every button may wrap');
  assert.ok(/@media \(max-width:369px\)\{html:not\(\.fx\) \.ctas \.buy\{white-space:normal/.test(css), 'the Spanish pair needs 370px: from 360 to 369 the labels wrap as well');
  // the rule can fail
  assert.notEqual(track('@media (max-width:900px){#c01 .stage{grid-template-columns:1fr}.pstat{grid-column:1}'), 'minmax(0,1fr)');
});

test('chapter 06 on a 320-359px phone: the struck words are sized to their cell (the widest is 140px at 26px, the cell held 106px)', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8');
  const rule = (t: string) => /@media \(max-width:359px\)\{\.nots li\{padding:24px (\d+)px\}\.nots s\{font-size:clamp\((\d+)px,([\d.]+)vw,(\d+)px\)\}\}/.exec(t)?.slice(1).map(Number);
  const r = rule(css);
  assert.ok(r, 'the phone rule of the struck words is in v3.css');
  // measured in Chromium at 26px with the shipped fonts: «computador» 139.9px, «background» 137.1, «experiencia» 130.5; no word of either list is longer than 11 letters
  const WIDEST_AT_26 = 139.9;
  for (const lang of ['es', 'en'] as const) for (const phrase of STR[lang].pub.v3.s3Palabras) for (const w of phrase.split(' ')) assert.ok(w.length <= 11, `«${w}» is longer than the words this rule was measured with: measure it again`);
  const fits = ([pad, lo, vw, hi]: number[]) => [320, 340, 359].every((w) => {
    const cell = (w - 2 * 16 - 1) / 2 - 2 * pad - 1, size = Math.min(hi, Math.max(lo, (vw * w) / 100));   // the plate's gutters, the list's left border, the cell's padding and right border
    return (WIDEST_AT_26 * size) / 26 <= cell;
  });
  assert.ok(fits(r!), 'the widest struck word is wider than its cell at some width between 320 and 359');
  assert.ok(!fits([18, 26, 6.6, 26]), 'the rule can fail: the old size (26px) and padding (18px) do not fit at 320');
});

// ---------- chapter 03: the sharpening drawing ----------
test('chapter 03: the request is the REAL tokens of case 3, the added chips are the words case 3\'s own tag names, and the bars are one distribution drawn flat, then sharp', () => {
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8');
  assert.ok(/const askP = piecesOf\(TOK, V\.s1Beats\[2\]\.tu\);/.test(page), 'the request row is the cut of case 3\'s pill in the committed token file');
  const fig = page.slice(page.indexOf('<figure class="sharp"'), page.indexOf('</figure>', page.indexOf('<figure class="sharp"')));
  assert.ok(/<em>\{V\.tabNext\} · \{V\.ilus\}<\/em>/.test(fig), 'the bars say what they are (the options for the next token, the term chapter 04 uses) and that they are a drawing');
  assert.ok(!/class="flat"|--u:/.test(fig), 'no unexplained dashed line in the drawing');
  for (const lang of ['es', 'en'] as const) assert.ok(STR[lang].pub.v3.tabNext && STR[lang].pub.v3.ilus, `${lang}: both words of the label exist`);
  for (const lang of ['es', 'en'] as const) {
    const V = STR[lang].pub.v3, tag = V.s1Beats[2].tag;
    assert.ok(piecesOf(TOKENS[lang], V.s1Beats[2].tu).length >= 6, `${lang}: the request has real pieces in the file`);
    assert.equal(V.askSlots.length, 3, `${lang}: three things are added to the request`);
    let at = 0;
    for (const w of V.askSlots) { const k = tag.indexOf(w, at); assert.ok(k >= 0, `${lang}: «${w}» is in case 3's tag «${tag}», in order`); at = k + w.length; }
  }
  const nums = (name: string) => (new RegExp(`const ${name} = \\[([^\\]]*)\\];`).exec(page)?.[1] ?? '').split(',').map(Number);
  const SHARP = nums('SHARP'), FLAT = nums('FLAT'), sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  assert.equal(SHARP.length, 10); assert.equal(FLAT.length, 10);
  assert.ok(Math.abs(sum(SHARP) - 1) < 1e-9 && Math.abs(sum(FLAT) - 1) < 1e-9, 'both pictures are a distribution: they add up to 1, on the same scale');
  assert.ok(SHARP.every((x, k) => k === 0 || x < SHARP[k - 1]), 'the sharp picture is sorted, one winner first');
  assert.ok(SHARP[0] >= 2 * SHARP[1], 'a clear winner: at least twice the runner-up');
  assert.ok(Math.max(...FLAT) / Math.min(...FLAT) <= 1.2, 'the flat picture is flat: every word about as likely');
  // the rule can fail
  assert.ok(!(0.4 >= 2 * 0.3), 'a winner only a third taller than the runner-up is not clear');
});

test('chapter 03: the effect is done within 2.5 s, the flat picture is seen before the first chip lands, and it is only transform and opacity', () => {
  const src = readFileSync(new URL('../src/aegis/fx/c03.ts', import.meta.url), 'utf8');
  const one = (re: RegExp) => { const m = re.exec(src); assert.ok(m, `c03.ts keeps ${re} where this test looks for it`); return m!.slice(1).map(Number); };
  const [CHIP_STEP, CHIP_DUR] = one(/const CHIP_STEP = ([\d.]+), CHIP_DUR = ([\d.]+);/);
  const [RISE_AT, RISE_DUR, BAR_STEP] = one(/const RISE_AT = ([\d.]+), RISE_DUR = ([\d.]+), BAR_STEP = ([\d.]+);/);
  const slotAt = /const SLOT_AT = \[([\d., ]+)\], SLOT_DUR = ([\d.]+);/.exec(src);
  assert.ok(slotAt, 'c03.ts keeps SLOT_AT');
  const SLOT_AT = slotAt![1].split(',').map(Number), SLOT_DUR = +slotAt![2];
  const [SHARP_LAG, SHARP_DUR] = one(/const SHARP_LAG = ([\d.]+), SHARP_DUR = ([\d.]+);/);
  assert.equal(SLOT_AT.length, 3, 'three slots land');
  const END = SLOT_AT[2] + SHARP_LAG + SHARP_DUR;
  assert.ok(END <= 2.5, `the drawing is done ${END.toFixed(2)} s after it came in`);
  assert.ok(SLOT_AT[2] + SLOT_DUR <= END, 'the last chip lands before the end');
  assert.ok(SLOT_AT.every((x, k) => k === 0 || x - SLOT_AT[k - 1] >= SHARP_LAG + 0.3), 'each slot gets a beat of its own');
  assert.ok(RISE_AT + 9 * BAR_STEP + RISE_DUR <= SLOT_AT[0], 'the ten bars have all risen (flat) before the first context chip lands: the flat picture is seen');
  assert.ok(9 * CHIP_STEP + CHIP_DUR <= SLOT_AT[0] + 0.1, 'the request has arrived by the time its first addition lands');
  assert.ok(/once\(panel, undo/.test(src) && /belowFold|once\(/.test(src), 'a play-once effect that asks once() (belowFold) before it arms anything');
  assert.ok(!/\.style\.(?!opacity\b|transform\b)\w+\s*=(?!=)/.test(src.replace(/\/\/.*$/gm, '')), 'c03.ts sets only style.opacity and style.transform');
  assert.ok(!/canvas|drawImage|fetch\(|\.webp|\.gif|\.apng/i.test(src.replace(/\/\/.*$/gm, '')), 'no footage, no sprite, no animated image');
  // the rule can fail
  assert.ok(0.8 + 0.1 + 0.45 + 1.5 > 2.5);
});

test('chapter 03 is square: no rounded corner, no circle, and no footage lens left behind anywhere', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const C03 = /(?:^|[\s,>+~])(?:\.sharp|\.spl|\.spr|\.sq|\.sl|\.sk|\.src|\.ilt|\.sb|\.bw|\.trio|\.tri)(?![\w-])/;
  const round = (body: string) => /border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(body);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const mine = rules.filter((r) => r.sel.split(',').some((s) => C03.test(s)));
  assert.ok(mine.length >= 12, `the chapter's rules are found (${mine.length})`);
  for (const r of mine) assert.ok(!round(r.body), `«${r.sel}» is round: chapter 03 is square HUD geometry`);
  assert.ok(!/\.lens\b|\.lc\b|\.lr\b|--fx-glow|data-lens/.test(css), 'the lens rules are gone from the stylesheet');
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), frames = readFileSync(new URL('../scripts/v3-frames.sh', import.meta.url), 'utf8');
  assert.ok(!/data-lens|\/v3\/lens/.test(page), 'the page names no lens pack');
  assert.ok(!/LENS/.test(frames), 'the frame script no longer builds lens packs');
  assert.throws(() => statSync(new URL('../public/v3/lens', import.meta.url)), 'public/v3/lens is gone');
  // the rule can fail
  assert.ok(round('border-radius:50%;width:1px') && round('border-radius:4px') && round('clip-path:circle(50%)') && !round('border-radius:0') && !round('border:1px solid red'));
});

test('chapter 03\'s class names are its own: no rule outside its block styles them (a `.pk` chip rule elsewhere once gave the winner bar a border and 14px of padding)', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*(?!!)[\s\S]*?\*\//g, '');
  const a = css.indexOf('.sharp{position:relative'), b = css.indexOf('.trio{display:grid'), tail = css.indexOf('.tri p{', b);
  assert.ok(a > 0 && b > a && tail > b, 'the chapter 03 block is where this test looks for it');
  const end = css.indexOf('}', tail) + 1, outside = css.slice(0, a) + css.slice(end);
  // the classes of the panel's own markup (the corner brackets and the dot are shared with other chapters): read from the page, so a class added later is covered too
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), at = page.indexOf('<figure class="sharp"'), fig = page.slice(at, page.indexOf('</figure>', at));
  const own = new Set([...fig.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).concat([...fig.matchAll(/class=\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]))));
  for (const shared of ['c', 'tl', 'tr', 'bl', 'br', 'dot']) own.delete(shared);
  assert.ok(['sharp', 'spl', 'spr', 'sq', 'sl', 'sk', 'ask', 'src', 'ilt', 'sb', 'bw', 'hi'].every((c) => own.has(c)), `the panel's classes are read from the markup (${[...own]})`);
  const NAMES = new RegExp(`\\.(?:${[...own].join('|')})(?![\\w-])`);
  const ALLOWED = new Set(['.sharp .c', '.sharp .tl', '.sharp .tr', '.sharp .bl', '.sharp .br', '.sharp', '.spl', '.spr', '.sb']);   // the corner brackets shared with the bio panel and the chat windows; the phone block
  const stray = (text: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim())).filter((s) => NAMES.test(s) && !ALLOWED.has(s) && !/\[data-sharp\]/.test(s));
  assert.deepEqual(stray(outside), [], 'a rule outside chapter 03\'s block styles one of its classes');
  assert.ok(outside.includes('.sharp .c') && outside.includes('[data-sharp]'), 'the shared and the stage-2B rules are still found (the test is not vacuous)');
  // the rule can fail
  assert.deepEqual(stray('.pk{padding:8px 12px}.bw i.pk{x:1}.sk{border:1px solid red}'), ['.bw i.pk', '.sk']);
});

// ---------- chapter 05: the drawings under the figures ----------
test('chapter 05: every drawing is done within 2.5 s of its card coming in, in the order the owner listed them, and card 5 has none yet', () => {
  assert.deepEqual([...VIZ], ['eg', 'curve', 'dials', 'freeze', null, 'stack'], 'examples, error curve, dials, frozen weights, (card 5: held), stacked bar');
  for (const [k, v] of Object.entries(END)) assert.ok(v >= 1.2 && v <= 2.5, `the ${k} drawing is done ${v.toFixed(2)} s after its card came in`);
  assert.ok(T.eg.first + (T.eg.n - 1) * T.eg.gap + T.eg.cross + T.eg.sink <= END.eg, 'the last tile has sunk into the slot before the queue is done');
  assert.ok(T.curve.t0 + T.curve.dur + T.curve.fade <= END.curve + 1e-9);
  assert.ok(T.freeze.train >= 0.8, 'the weights are seen training before they freeze');
  assert.ok(T.freeze.train + T.freeze.sweep + T.freeze.lock <= END.freeze, 'every weight is locked before the end');
  assert.ok(T.dials.a0 + (DIALS.cols - 1) * T.dials.dx + (DIALS.rows - 1) * T.dials.dy + T.dials.turn <= T.dials.a0 + (DIALS.cols - 1) * T.dials.dx + (DIALS.rows - 1) * T.dials.dy + T.dials.lag, 'the second wave starts after the first turn has ended');
  // the rule can fail
  assert.ok(T.eg.first + 4 * 0.3 + T.eg.cross + 1.2 > 2.5);
});

test('chapter 05: what a drawing draws from its card it reads FROM the figure, in both languages, and it refuses a figure it cannot read', () => {
  for (const lang of ['es', 'en'] as const) {
    const m = modulos(lang);
    assert.deepEqual(figureInts(m[1].k), [94, 23, 4], `${lang}: card 2's figure`);
    const c = curveOf(m[1].k);
    assert.deepEqual(c.pts.map((p) => p.v), [94, 23, 4], `${lang}: the curve passes through the figure's three values`);
    assert.ok(c.pts[0].y < c.pts[1].y && c.pts[1].y < c.pts[2].y, 'a lower value is drawn lower');
    assert.ok(c.pts.every((p) => p.y >= CURVE.top && p.y <= CURVE.base), 'the points are inside the drawing');
    const w = stackOf(m[5].k);
    assert.equal(w[0], 31, `${lang}: the first segment is the figure's 31`); assert.equal(w.length, 8); assert.equal(w.reduce((x, y) => x + y, 0), 100);
    assert.deepEqual(w, [31, 22, 16, 11, 8, 6, 4, 2], 'the options of the page as they are drawn today');
  }
  for (let n = 1; n <= 93; n++) { const w = stackOf(`${n} de 100`); assert.equal(w.reduce((x, y) => x + y, 0), 100, `${n} of 100 adds up`); assert.equal(w[0], n); assert.ok(w.every((x) => x >= 1), `${n} of 100 has no empty segment`); }
  assert.throws(() => stackOf('94 de 100'), /cannot be drawn/); assert.throws(() => stackOf('31 de 90'), /cannot be drawn/); assert.throws(() => stackOf('31'), /cannot be drawn/);
  assert.throws(() => curveOf('94 → 23'), /cannot be drawn/); assert.throws(() => curveOf('4 → 23 → 94'), /cannot be drawn/); assert.throws(() => curveOf('94 → 23 → 140'), /cannot be drawn/);
  const a = dialAngles(), h = weightHeights();
  assert.equal(a.length, DIALS.cols * DIALS.rows); assert.ok(a.every((x) => Number.isInteger(x) && Math.abs(x) <= 130), 'every dial rests within ±130°');
  assert.equal(h.length, WEIGHTS); assert.ok(h.every((x) => x >= 0.3 && x <= 1), 'every weight is frozen between 0.3 and 1 of its box');
  assert.ok(new Set(a).size > 12 && new Set(h).size > 8, 'the dials and the weights are not all alike');
  assert.equal(ANSWERS, 5);
  assert.deepEqual(dialAngles(), a, 'the same drawing on every render');
  // the rule can fail
  assert.notDeepEqual(figureInts('94 → 23 → 4'), figureInts('94 → 25 → 4'));
});

test('chapter 05: the chapter writes a style on at most 80 nodes in a whole pass (the drawings, the parts they add, and the pinned track\'s own nine)', () => {
  const all = Object.values(NODES).reduce((x, y) => x + y, 0);
  assert.ok(all + TRACK_NODES <= NODE_BUDGET, `the drawings write on ${all} nodes and the track on ${TRACK_NODES}: ${all + TRACK_NODES} > ${NODE_BUDGET}`);
  assert.equal(NODES.dials, DIALS.cols * DIALS.rows); assert.equal(NODES.freeze, WEIGHTS + ANSWERS + 1); assert.equal(NODES.eg, T.eg.n + 1 + T.eg.queue);
  assert.equal(NODE_BUDGET, 80, 'the budget of the contract');
  // a part that appears with others is revealed by its container: the ruler of the stacked bar is one clip, never one fade per tick
  const code = readFileSync(new URL('../src/aegis/fx/c05v.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/ruler!?\.style\.clipPath/.test(code) && !/ticks/.test(code), 'the ruler is one node');
  // the rule can fail: the first version (30 dials, 16 weights, 11 ticks) was 96 nodes with the track
  assert.ok(30 + (16 + ANSWERS + 1) + NODES.eg + NODES.curve + (8 + 11 + 1) + TRACK_NODES > NODE_BUDGET);
});

test('chapter 05: a drawing has no copy of its own (the component writes only the tag it is given), nothing in it is round, and the effect plays the clocks of c05-data', () => {
  const comp = readFileSync(new URL('../src/components/V3Viz.astro', import.meta.url), 'utf8'), body = comp.slice(comp.indexOf('<div class="viz"'));
  let text = body; while (/\{[^{}]*\}/.test(text)) text = text.replace(/\{[^{}]*\}/g, '');
  assert.equal(text.replace(/<[^>]+>/g, '').replace(/\s+/g, ''), '', 'the markup of a drawing holds no text but expressions (the tag is the page\'s own ILUSTRATIVO)');
  assert.ok(/<p class="vz-tag"><i class="dot"><\/i><em>\{tag\}<\/em><\/p>/.test(comp) && /aria-hidden="true"/.test(comp), 'the tag and aria-hidden are in the component');
  assert.ok(!/<img|<canvas|<circle|<ellipse|border-radius|rx=/.test(comp), 'no image, no round shape');
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const mine = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((r) => /\.vz-|\.viz\b|\.vx\b|\[data-viz\]/.test(r.sel));
  assert.ok(mine.length >= 35, `the drawings' rules are found (${mine.length})`);
  for (const r of mine) assert.ok(!/border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(r.body), `«${r.sel}» is round`);
  const src = readFileSync(new URL('../src/aegis/fx/c05v.ts', import.meta.url), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(/import \{[^}]*\bEND\b[^}]*\} from '\.\.\/c05-data'/.test(src) && /import \{[^}]*\bT\b[^}]*\} from '\.\.\/c05-data'/.test(src), 'c05v.ts reads its clocks from c05-data');
  for (const k of ['eg', 'curve', 'dials', 'freeze', 'stack']) assert.ok(new RegExp(`end: END\\.${k}\\b`).test(code), `the ${k} drawing ends when c05-data says`);
  assert.ok(!/\.style\.(?!opacity\b|transform\b|clipPath\b)\w+\s*=(?!=)/.test(code), 'c05v.ts sets only style.opacity, style.transform and style.clipPath');
  assert.ok(!/canvas|drawImage|fetch\(|\.webp|\.gif|\.apng/i.test(code), 'no footage, no sprite, no animated image');
  assert.ok(/initC05V/.test(readFileSync(new URL('../src/aegis/fx/index.ts', import.meta.url), 'utf8')), 'the effect is registered');
});

// ---------- chapter 02: the chat windows ----------
test('chapter 02: every answer streams through the REAL pieces of its string and is done within 2.5 s of its window coming in', () => {
  const src = readFileSync(new URL('../src/aegis/fx/c02.ts', import.meta.url), 'utf8');
  // the answers' pieces come from the committed token file (the page ships them), never from a cut of the effect's own
  assert.ok(/piecesOf\(TOK, text\)/.test(src) && /tokensFromPage\(\)/.test(src), 'c02.ts reads the pieces of the answers from #v3-tokens');
  assert.ok(!/tokenize\(|\.split\((?:''|"")\)/.test(src), 'c02.ts does not cut text by a heuristic of its own');
  for (const lang of ['es', 'en'] as const) for (const b of STR[lang].pub.v3.s1Beats) assert.ok(piecesOf(TOKENS[lang], b.ia).length > 3, `${lang}: the answer «${b.ia.slice(0, 30)}…» has real pieces in the file`);
  // the budget: the timings are in the source, and their sum is what a reader waits
  const T = /const T = two \? \{ pill: ([\d.]+), think: ([\d.]+), stream: ([\d.]+) \} : \{ pill: ([\d.]+), think: ([\d.]+), stream: ([\d.]+) \};/.exec(src);
  const dur = /const dur = two \? ([\d.]+) : clamp\(([\d.]+) \+ n \* ([\d.]+), ([\d.]+), ([\d.]+)\);/.exec(src);
  assert.ok(T && dur, 'c02.ts keeps its timings where this test looks for them');
  const [, , , s2, , , s1] = T!.map(Number), [, d2, , , , dmax] = dur!.map(Number);
  assert.ok(s2 + d2 <= 2.5, `window 2 is done ${(s2 + d2).toFixed(2)} s after it came in`);
  assert.ok(s1 + dmax <= 2.5, `a short window is done at most ${(s1 + dmax).toFixed(2)} s after it came in`);
  // the rule can fail
  assert.ok(1.4 + 1.3 > 2.5);
});

test('chapter 02: no avatar, no visible YOU / AI label, nobody else\'s mark: the labels are screen-reader-only and the markup has the owner\'s pieces', () => {
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8');
  const sec = page.slice(page.indexOf('<section id="c02"'), page.indexOf('</section>', page.indexOf('<section id="c02"')));
  assert.ok(!/chatgpt|openai|gpt-/i.test(sec), 'chapter 02 does not name another product');
  assert.ok(!/<img\b|class="who"/.test(sec), 'no avatar image, no visible label');
  assert.equal((sec.match(/<span class="sr">\{V\.chat(?:Tu|Ia)\}<\/span>/g) ?? []).length, 5, 'the labels are sr-only spans: the first instruction of window 2, then a pill and an answer in each of the two branches of the markup (window 2 inside its bracket, the others without)');
  const sr = /\.sr\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(/position:absolute/.test(sr) && /width:1px/.test(sr) && /clip:rect\(0 0 0 0\)/.test(sr), '.sr is the visually-hidden pattern');
});

// ---------- the 60 fps pass: the engine's quality ratchet, the footage's decode window, no GIF ----------
/** Feed a ratchet `n` frames of `ms` each and return the steps it asked for, with the frame each came at. */
const feed = (r: ReturnType<typeof createRatchet>, n: number, ms: number | ((i: number) => number)) => {
  const out: Array<[number, Step]> = [];
  for (let i = 0; i < n; i++) { const st = r.frame(typeof ms === 'function' ? ms(i) : ms); if (st) out.push([i, st]); }
  return out;
};

test('quality ratchet: a device that cannot hold the frame rate gives up one step at a time, in order, each once, and the ladder stops', () => {
  const r = createRatchet(1.5);
  assert.deepEqual([...LADDER], ['pr125', 'pr100', 'blur', 'ca', 'bloom']); assert.equal(r.size, 5);
  const steps = feed(r, 3000, 40);                                  // 25 fps for 2 minutes
  assert.deepEqual(steps.map((x) => x[1]), [...LADDER], 'every step, in the order of the ladder, once');
  assert.deepEqual([...r.taken], [...LADDER]); assert.ok(r.done);
  assert.equal(r.frame(40), null, 'nothing is left to give up');
  // it is not in a hurry: it waits out the warm-up first, and every step has `settle` frames to be judged on its own
  assert.ok(steps[0][0] >= DEFAULTS.warm + DEFAULTS.win, `the first step came at frame ${steps[0][0]}, after the warm-up and a full window`);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i][0] - steps[i - 1][0] >= DEFAULTS.settle + DEFAULTS.win, `steps ${i - 1} and ${i} are ${steps[i][0] - steps[i - 1][0]} frames apart`);
  // the names the console says
  for (const s of LADDER) assert.ok(WHAT[s].length > 5, `${s} has a name`);
});

test('quality ratchet: it never goes back up, and one hitch is not a slow device', () => {
  const r = createRatchet(1.5);
  feed(r, 400, 40); assert.ok(r.taken.length >= 2);
  const before = [...r.taken];
  assert.deepEqual(feed(r, 5000, 8), [], 'a device that recovered is left where it is: no step comes back');
  assert.deepEqual([...r.taken], before);
  // 60 fps with one 250 ms hitch in every window of 60 frames (a decode, a GC): neither the average nor the share of slow frames moves enough
  const h = createRatchet(1.5);
  assert.deepEqual(feed(h, 6000, (i) => (i % 60 === 30 ? 250 : 16.7)), [], 'one hitch per window is not a reason to give anything up');
  // the same device with three of them in every window is
  const bad = createRatchet(1.5);
  assert.ok(feed(bad, 6000, (i) => (i % 20 === 10 ? 250 : 16.7)).length >= 1, 'three hitches per window is');
  // 60 fps with the odd dropped frame (33 ms, one in 30) is a healthy device
  const ok = createRatchet(1.5);
  assert.deepEqual(feed(ok, 6000, (i) => (i % 30 === 0 ? 33.3 : 16.7)), []);
  // one frame in five dropped (about 48 fps) is not
  const slow = createRatchet(1.5);
  assert.ok(feed(slow, 3000, (i) => (i % 5 === 0 ? 33.3 : 16.7)).length >= 1);
});

test('quality ratchet: a step that would do nothing on this device is not a step, and a pause is not a slow device', () => {
  assert.deepEqual([...createRatchet(1).taken], []); assert.equal(createRatchet(1).size, 3, 'a 1x screen starts at the motion blur');
  assert.equal(createRatchet(1.25).size, 4); assert.equal(createRatchet(1.5).size, 5); assert.equal(createRatchet(1.75).size, 5);
  assert.deepEqual(feed(createRatchet(1), 3000, 40).map((x) => x[1]), ['blur', 'ca', 'bloom']);
  assert.deepEqual(feed(createRatchet(1.25), 3000, 40).map((x) => x[1]), ['pr100', 'blur', 'ca', 'bloom']);
  // a hidden tab: every gap is a few seconds. The history is cleared each time, so it never fills
  assert.deepEqual(feed(createRatchet(1.5), 500, 5000), []);
  // numbers that are not times are not frames
  const r = createRatchet(1.5);
  assert.deepEqual(feed(r, 500, () => NaN).concat(feed(r, 500, -1)), []);
  // random streams: never more than one step per frame, never a step twice, always a prefix of the ladder
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const q = createRatchet(rnd() < 0.5 ? 1.5 : 1), mean = 10 + rnd() * 40; const got: Step[] = [];
    for (let i = 0; i < 2500; i++) { const st = q.frame(Math.max(1, mean * (0.5 + rnd()))); if (st) got.push(st); }
    assert.deepEqual(got, [...q.taken]); assert.equal(new Set(got).size, got.length);
    assert.deepEqual(got, LADDER.filter((x) => got.includes(x)).slice(0, got.length), 'in the order of the ladder');
  }
});

test('the engine feeds the ratchet only the frames it drew, lowers the pixel ratio and nothing else in the same breath, says each step once and lets nothing raise it', () => {
  const src = readFileSync(new URL('../src/aegis/engine.ts', import.meta.url), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(/const step = ratchet\.frame\(ms\)/.test(code) && /if \(!la\) \{ show\(false\); lastDraw = 0; return; \}\s*show\(true\);\s*feed\(\);/.test(code), 'only drawn frames are fed, and a frame the canvas sat out breaks the interval');
  const assigns = [...code.matchAll(/\bPR = ([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(assigns.sort(), ['1', '1.25', 'Math.min(A.dpr, 1.5)'].sort(), 'PR is set once from the display and then only ever to 1.25 or 1');
  assert.equal((code.match(/console\.info\(`\[v3\] quality/g) ?? []).length, 1, 'one line says every step (it runs once per step: the ratchet gives each step once)');
  assert.ok(/Q\.bloom\) \{/.test(code) && /Q\.ca \?/.test(code) && /!Q\.blur \?/.test(code), 'the three effects the ladder gives up are the ones switched by Q');
  assert.ok(!/Q\.(?:blur|ca|bloom) = true/.test(code.slice(code.indexOf('function feed'))), 'nothing turns a given-up effect back on');
  assert.ok(/get PR\(\) \{ return PR; \}/.test(code), 'the engine hands out its CURRENT pixel ratio');
  const llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8');
  assert.ok(/uPR\.value = gl\.PR/.test(llm), 'the chapter that sizes points by the pixel ratio follows it');
  assert.ok(/dataset\.q = String\(ratchet\.taken\.length\)/.test(code), 'the step the visit is at is on <html data-q> (the fps harness reads it)');
});

test('footage decode window: it leans the way the reader is going, in both directions, and stays inside the pack and the bitmaps a phone keeps', () => {
  assert.deepEqual(ahead(10, 1, 128), [10, 11, 12, 13, 14, 15, 9], 'forward: the pair, four ahead, the one just left');
  assert.deepEqual(ahead(10, -1, 128), [10, 11, 9, 8, 7, 6, 12], 'backward: the mirror');
  assert.deepEqual(ahead(0, -1, 128), [0, 1, 2], 'at the start going back there is nothing behind the pair but the one it just left');
  assert.deepEqual(ahead(127, 1, 128), [127, 126], 'at the end going forward');
  assert.deepEqual(ahead(126, 1, 128), [126, 127, 125]);
  for (const dir of [1, -1]) for (const n of [1, 2, 48, 128]) for (let i = 0; i < n; i++) {
    const w = ahead(i, dir, n);
    assert.equal(new Set(w).size, w.length, 'no frame twice'); assert.ok(w.every((j) => j >= 0 && j < n), 'inside the pack'); assert.ok(w.length <= 8, 'inside the 8 bitmaps a phone keeps');
    assert.equal(w[0], i, 'the frame it draws comes first'); if (i + 1 < n) assert.equal(w[1], i + 1, 'then the one it blends with');
  }
  const seq = readFileSync(new URL('../src/aegis/seq.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), eng = readFileSync(new URL('../src/aegis/engine.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/ahead\(i0, w\.dir, n\)/.test(eng) && /seq\.setFocus\(f, w\.dir\)/.test(eng), 'the engine asks for the window of the direction it measured');
  assert.ok(!/const dir = 1;/.test(eng), 'no direction hard-wired to forward');
  assert.ok(/\(i - this\.focus\) \* this\.dir < 0/.test(seq) && /\(k - this\.focus\) \* this\.dir < 0/.test(seq), 'the fetch order and the eviction order both know which frames are behind');
  // the rule can fail: the old window had one frame behind it and nothing mirrored
  const old = (i0: number, dir: number) => [i0, i0 + 1, i0 + 2 * dir, i0 + 3 * dir, i0 - 1, i0 + 4];
  assert.notDeepEqual(old(10, -1).slice().sort((a, b) => a - b), ahead(10, -1, 128).slice().sort((a, b) => a - b));
});

test('no GIF, no APNG: not a file under public/v3, not a reference in the page, its styles or its scripts', () => {
  const walk = (d: URL): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : [new URL(e.name, d).pathname]));
  const files = walk(new URL('../public/v3/', import.meta.url));
  assert.ok(files.length > 100, `the media are found (${files.length})`);
  assert.deepEqual(files.filter((f) => /\.(?:gif|apng)$/i.test(f)), [], 'no GIF or APNG file under public/v3');
  assert.ok(files.every((f) => /\.(?:webp|jpg|jpeg|png|svg|json|woff2?)$/i.test(f)), `every file under public/v3 is a still or a font (${[...new Set(files.map((f) => f.split('.').pop()))]})`);
  const src = ['../src/pages/v3.astro', '../src/aegis/v3.css', '../src/aegis/main.ts', '../src/aegis/seq.ts', '../src/aegis/engine.ts'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/\.gif\b|\.apng\b|image\/(?:gif|apng)/i.test(src), 'no reference to one in the sources');
  // the rule can fail
  assert.ok(/\.gif\b/i.test('<img src="/v3/a.gif">') && /image\/apng/i.test('data:image/apng;base64,AA'));
});

test('the two hitches the fps pass found stay fixed (chapter 06 samples its words as a job, one step a frame; chapter L compiles its shader before it is seen), and the harness is wired', () => {
  const c06 = readFileSync(new URL('../src/aegis/fx/c06.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/const build = function\* \(\): Generator<void>/.test(c06), 'the sampling of the words is a generator');
  assert.ok(/job\.next\(\)\.done/.test(c06) && /if \(!job\) job = build\(\);/.test(c06), 'and a frame pumps ONE step of it');
  assert.equal((c06.match(/\bbuild\(\)/g) ?? []).length, 1, 'nothing runs the whole sampling in one go: the only call makes the job');
  assert.ok(/!built && A\.st\.y \+ A\.H \* 3\.5 > top\) pump\(\);/.test(c06), 'it is the frame that pumps it, from 3.5 screens before the chapter');
  assert.ok(/built = false; job = null;/.test(c06), 'a new layout drops a half-built job');
  assert.ok(/R\.compileAsync\(scene, cam\)/.test(llm) && /ch\.warm = /.test(llm), 'chapter L compiles its shader (async) when it warms, not in the frame it first draws');
  assert.ok(/if \(R\.extensions\.has\('KHR_parallel_shader_compile'\)\) R\.compileAsync/.test(llm), 'and only where the browser can compile in parallel (Firefox cannot: asking would only put a warning in its console)');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['fps:v3'], 'node scripts/v3-fps.mjs');
  assert.ok(/fps:v3/.test(readFileSync(new URL('../../RUNBOOK.md', import.meta.url), 'utf8')), 'the RUNBOOK says how to run it');
});

test('chapter 04: the arcs are one draw call in the order they were made, and row A\'s padding never jumps by 3 px or more between two rendered frames (only the review hook __v3Go lets it arrive at once)', () => {
  const llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), core = readFileSync(new URL('../src/aegis/core.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  // the arcs: one LineSegments, one index buffer, an alpha per vertex (0 while an arc is hidden), none of the old per-arc Line objects or materials
  assert.ok(/new THREE\.LineSegments\(arcGeo, arcMat\)/.test(llm) && /setIndex\(new THREE\.BufferAttribute\(arcIdx, 1\)\)/.test(llm), 'the 45 curves are one LineSegments with an index buffer');
  assert.ok(!/new THREE\.Line\(/.test(llm) && !/a\.line\b/.test(llm) && !/\.line\.material/.test(llm), 'no per-arc Line object or material is left');
  assert.ok(/arcAlpha\.fill\(shown \? Math\.min\(1, o\) : 0, a\.base, a\.base \+ AS \+ 1\)/.test(llm), 'an arc that is not drawn has alpha exactly 0');
  assert.ok(/flat varying float vA/.test(llm), 'the alpha is flat: the arc\'s own opacity to the last bit, not an interpolation of it');
  // the padding: written from a value that follows its target by at most PAD_STEP per rendered frame (A.st.f counts the real ticker's frames; a forced tick for a review jump is not one), except on the review hook
  // __v3Go, where it arrives at once (A.st.snap)
  assert.ok(/c\.style\.setProperty\('--pad', padA\.toFixed\(1\) \+ 'px'\)/.test(llm), 'row A writes padA');
  assert.ok(/const padA = followStep\(padS, \(mob \? 6 : 9\) \* tpA, PAD_STEP, A\.st\.f, A\.st\.snap\);/.test(llm), 'padA is the follower\'s value, given the rendered frame count and the snap flag');
  assert.ok(/padS: Follow = \{ cur: -1, frame: -1 \}/.test(llm), 'the follower starts with no value, so it starts at its target');
  const PAD_STEP = Number(/const PAD_STEP = ([0-9.]+)[,;]/.exec(llm)?.[1]);
  assert.ok(PAD_STEP > 0 && PAD_STEP < 3, `PAD_STEP is under the 3 px a layout shift needs (${PAD_STEP})`);
  assert.equal((core.match(/A\.st\.f\+\+/g) ?? []).length, 2, 'the two ticker callbacks (smooth scroll and reduced motion) count rendered frames, and nothing else does');
  // the hooks: the flag is raised for the forced ticks of __v3Go and nothing else (not __v3Y: the layout-shift probes scroll with it and must see what a reader's scroll does, and the real ticker never sets it)
  const FORCED = /const forcedTicks = \(snap: boolean\) => \{ A\.st\.snap = snap; try \{ tick\(performance\.now\(\), true\); tick\(performance\.now\(\) \+ 16, true\); \} finally \{ A\.st\.snap = false; \} \};/;
  const GO = /__v3Go = \(id: string, p: number, snap = true\) => \{[^}]*scrollToY\(y\); forcedTicks\(snap\); return y;/, GOY = /__v3Y = \(y: number\) => \{ scrollToY\(y\); forcedTicks\(false\); return y; \}/;
  const hookRules = (src: string) => FORCED.test(src) && GO.test(src) && GOY.test(src) && (src.match(/A\.st\.snap\s*=[^=]/g) ?? []).length === 2;
  assert.ok(hookRules(core), 'forcedTicks raises the flag for the two ticks and always lowers it (finally); __v3Go snaps unless asked not to; __v3Y never does; the flag is written nowhere else (the resize handler\'s own forced tick never snaps)');
  for (const [name, mutant] of [
    ['the flag is not lowered after the ticks', core.replace('finally { A.st.snap = false; }', 'finally { }')],
    ['__v3Y snaps', core.replace('forcedTicks(false); return y; };', 'forcedTicks(true); return y; };')],
    ['__v3Go does not snap', core.replace('snap = true) =>', 'snap = false) =>')],
    ['the ticker raises the flag', core.replace('A.st.f++; tick();', 'A.st.f++; A.st.snap = true; tick();')],
    ['a hook ticks on its own', core.replace('forcedTicks(false); return y; };', 'tick(performance.now(), true); return y; };')],
    ['the flag is lowered only when a tick throws', core.replace('finally { A.st.snap = false; }', 'catch { A.st.snap = false; }')],
  ] as const) { assert.notEqual(mutant, core, `the mutant "${name}" changed the source`); assert.ok(!hookRules(mutant), `the hook rules catch: ${name}`); }
  const state = readFileSync(new URL('../src/aegis/state.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/st: \{ y: 0, v: 0, t: 0, f: 0, snap: false, mouse/.test(state), 'the flag is false until a hook raises it');
  // the follower itself (toward): never past its target, never more than a step, and it gets there
  for (const [cur, tgt] of [[0, 9], [9, 0], [4.5, 4.5], [0, 1], [8.9, 9], [3, -3]]) {
    let c = cur, n = 0; while (c !== tgt && n < 100) { const nx = toward(c, tgt, PAD_STEP); assert.ok(Math.abs(nx - c) <= PAD_STEP + 1e-9, 'a step is at most PAD_STEP'); assert.ok((nx - tgt) * (c - tgt) >= 0, 'never past the target'); c = nx; n++; }
    assert.equal(c, tgt, `${cur} -> ${tgt} arrives`); assert.ok(n <= Math.ceil(Math.abs(cur - tgt) / PAD_STEP) + 1);
  }
  assert.equal(toward(0, 9, 2.4), 2.4); assert.equal(toward(9, 0, 2.4), 6.6);
  // followStep: it starts at its target, moves once per rendered frame however many calls the frame makes, and arrives at once (and keeps its frame) when the call is a forced review jump
  const fresh = (): Follow => ({ cur: -1, frame: -1 }), r1 = (v: number) => +v.toFixed(1);
  { const s = fresh(); assert.equal(followStep(s, 6, PAD_STEP, 5, false), 6, 'its first value is its target'); assert.equal(s.frame, -1, 'and is not the move of a frame'); }
  { const s = fresh(); followStep(s, 0, PAD_STEP, 1, false); assert.deepEqual([2, 2, 2, 3, 3, 4, 5].map((f) => r1(followStep(s, 9, PAD_STEP, f, false))), [2.4, 2.4, 2.4, 4.8, 4.8, 7.2, 9], 'one step per rendered frame, none for a second call of the same frame'); }
  { const s: Follow = { cur: 0, frame: 1 }; assert.equal(followStep(s, 9, PAD_STEP, 1, false), 0, 'a frozen clock (no new frame, ever) never moves it'); assert.equal(followStep(s, 9, PAD_STEP, 1, true), 9, 'but a forced jump arrives anyway'); }
  for (const [cur, tgt] of [[0, 9], [9, 0], [2.4, 6.6], [4.5, 4.5], [0, 6]]) for (const f of [7, 8]) { const s: Follow = { cur, frame: 7 }; assert.equal(followStep(s, tgt, PAD_STEP, f, true), tgt, `${cur} -> ${tgt} at once (frame ${f})`); assert.equal(s.frame, 7, 'a forced jump does not use up a rendered frame'); }
  // the jump lands where the page settles: for 400 random starting points, targets and frames, the snapped value is the one the ordinary follower reaches (to the tenth of a pixel that is written) after the frames it needs
  { const r = rng(11); for (let i = 0; i < 400; i++) { const cur = r() * 9, tgt = r() < 0.2 ? 0 : r() * 9, s: Follow = { cur, frame: 0 }, o: Follow = { cur, frame: 0 }; let v = 0; for (let f = 1; f <= 6; f++) v = followStep(o, tgt, PAD_STEP, f, false); assert.equal(r1(followStep(s, tgt, PAD_STEP, 99, true)), r1(v), `${cur.toFixed(2)} -> ${tgt.toFixed(2)}`); } }
  // and without the hook nothing changed: call for call the follower is the logic llm.ts had inline (`if (padA < 0) padA = padT; else if (A.st.f !== padFrame) { padFrame = A.st.f; padA = toward(padA, padT, PAD_STEP); }`)
  { const r = rng(5), old = { padA: -1, padFrame: -1 }, s = fresh(); let f = 0;
    for (let i = 0; i < 4000; i++) {
      if (r() < 0.55) f++; const t = r() < 0.15 ? 0 : r() < 0.3 ? 9 : r() * 9;
      if (old.padA < 0) old.padA = t; else if (f !== old.padFrame) { old.padFrame = f; old.padA = toward(old.padA, t, PAD_STEP); }
      assert.equal(followStep(s, t, PAD_STEP, f, false), old.padA, `call ${i}`);
    } }
});

test('chapter 04: the output node is a square outline (no round geometry in the scene), in the box of the ring it replaced, and its pulse grows as a square', () => {
  const llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/RingGeometry|CircleGeometry|SphereGeometry|TorusGeometry|CylinderGeometry|EllipseCurve|ArcCurve/.test(llm), 'no round geometry in the scene of chapter 04');
  // the box, the thickness and the colour of the ring (0.17..0.19, 0.17..0.18, #0A84FF) are the square's
  assert.ok(/nodeFrame = new THREE\.Mesh\(frameGeo\(0\.19, 0\.17\), accentMat\(\)\)/.test(llm), 'the node frame: outer half-side 0.19 (the ring\'s outer radius), inner 0.17');
  assert.ok(/nodePulse = new THREE\.Mesh\(frameGeo\(0\.18, 0\.17\), accentMat\(\)\)/.test(llm), 'the pulse: 0.18 / 0.17, as before');
  assert.ok(/new THREE\.MeshBasicMaterial\(\{ color: 0x0A84FF,/.test(llm), 'the colour is the same #0A84FF');
  assert.ok(/nodePulse\.scale\.setScalar\(1 \+ 2\.4 \* eo\(flash\)\)/.test(llm), 'one scale on both axes: a square pulse grows as a square, and scale and opacity are all that ever changes');
  assert.ok(/node\.quaternion\.copy\(cam\.quaternion\)/.test(llm), 'the node faces the camera: a square on the screen, not a tilted rectangle');
  // the geometry itself: 8 flat vertices, 8 triangles that are never degenerate, each in the band between the inner and the outer square, together exactly that band
  for (const [o, i] of [[0.19, 0.17], [0.18, 0.17], [1, 0.5]] as const) {
    const { pos, idx } = squareFrame(o, i);
    assert.equal(pos.length, 24); assert.equal(idx.length, 24);
    for (let v = 0; v < 8; v++) { assert.equal(pos[v * 3 + 2], 0, 'flat'); const r = Math.fround(v < 4 ? o : i); assert.equal(Math.abs(pos[v * 3]), r); assert.equal(Math.abs(pos[v * 3 + 1]), r); }
    let area = 0;
    for (let k = 0; k < idx.length; k += 3) {
      const [a, b, c] = [idx[k], idx[k + 1], idx[k + 2]], P = (n: number) => [pos[n * 3], pos[n * 3 + 1]] as const;
      const [ax, ay] = P(a), [bx, by] = P(b), [cx, cy] = P(c), cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      assert.ok(Math.abs(cross) > 1e-9, 'no degenerate triangle'); area += Math.abs(cross) / 2;
      const m = Math.max(Math.abs((ax + bx + cx) / 3), Math.abs((ay + by + cy) / 3)); assert.ok(m > i && m < o, 'each triangle lies in the band between the two squares');
    }
    const O = Math.fround(o), I = Math.fround(i); assert.ok(Math.abs(area - (4 * O * O - 4 * I * I)) < 1e-9, 'the triangles cover exactly the outer square minus the inner one');
  }
});

test('chapter 01: the data card\'s light moves by transform, not by layout, and covers the same ground as the `left` it replaced', () => {
  const hud = readFileSync(new URL('../src/aegis/hud.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8');
  assert.ok(!/sweep\.style\.(left|right|top|bottom|width|height|margin|padding)\b/.test(hud), 'the sweep never writes a layout property: a band that moves 3 px or more in a frame is a layout shift');
  const k = Number(/sweep\.style\.transform = `translate3d\(\$\{\(([0-9.]+) \* clamp\(p \* 1\.2\)\)\.toFixed\(1\)\}%,0,0\)`/.exec(hud)?.[1]);
  const rule = /html\.fx \.card \.sweep\{([^}]*)\}/.exec(css)?.[1] ?? '', left = Number(/left:(-?[0-9.]+)%/.exec(rule)?.[1]), width = Number(/width:([0-9.]+)%/.exec(rule)?.[1]);
  assert.ok(Number.isFinite(k) && Number.isFinite(left) && Number.isFinite(width), 'the transform, the stylesheet\'s left and its width are all there to read');
  // it starts just outside the card on the left (its right edge on the card's left edge) and ends just outside on the right: 100 + 2 x width % of the card, and k % of its own width is that much
  assert.equal(left, -width, 'it starts with its right edge on the card\'s left edge');
  assert.ok(Math.abs((k * width) / 100 - (100 + 2 * width)) < 1e-9, `${k} % of a ${width} %-wide band is ${(k * width) / 100} % of the card; the way across is ${100 + 2 * width} %`);
});

test('chapter 04: the output node\'s core is a light with a SQUARE falloff (the Chebyshev distance) and the stops of a dot\'s, and only the node uses it', () => {
  const llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/GLOWT = mkSquareTex\(128, 0\.05\)/.test(llm) && /DOT = mkTex\(64, 0\.22\)/.test(llm), 'the node\'s core is the square light; the dots keep their round one');
  assert.equal((llm.match(/\bGLOWT\b/g) ?? []).length, 2, 'GLOWT is made once and read once: by the node\'s core');
  assert.ok(/map: GLOWT, color: 0x0A84FF, opacity: 0/.test(llm), 'the core keeps its colour and starts at opacity 0 (the opacity law and the flash are the node\'s own, untouched)');
  assert.ok(/squareGlow\(\(i \+ 0\.5 - h\) \/ h, \(j \+ 0\.5 - h\) \/ h, hard\)/.test(llm), 'every texel is lit by squareGlow at the centre of the texel');
  // the stops of the radial gradient it replaces: 1 at the centre, 0.8 at `hard`, 0 at the edge, falling all the way and never rising
  for (const hard of [0.05, 0.22]) {
    assert.equal(glowAlpha(0, hard), 1); assert.ok(Math.abs(glowAlpha(hard, hard) - 0.8) < 1e-12); assert.equal(glowAlpha(1, hard), 0); assert.equal(glowAlpha(1.7, hard), 0);
    let prev = 1; for (let k = 0; k <= 2000; k++) { const v = glowAlpha(k / 2000, hard); assert.ok(v <= prev + 1e-12 && v >= 0, `monotone and in range at ${k / 2000}`); prev = v; }
  }
  // square: the light depends on max(|x|, |y|) alone, so it is the same all along a side and in a corner (a circle's corner is dark), and the same in all four quadrants
  const h = 0.05;
  assert.equal(squareGlow(0.6, 0, h), squareGlow(0.6, 0.6, h)); assert.equal(squareGlow(0.6, 0.3, h), squareGlow(-0.6, -0.6, h)); assert.equal(squareGlow(0.3, -0.6, h), squareGlow(-0.6, 0.1, h));
  assert.ok(squareGlow(0.9, 0.9, h) > 0 && Math.hypot(0.9, 0.9) > 1 && glowAlpha(Math.hypot(0.9, 0.9), h) === 0, 'the corner of the sprite is lit by the square falloff and was dark in the round one');
  assert.equal(squareGlow(1, 0.2, h), 0); assert.equal(squareGlow(0.2, -1, h), 0);                  // it dies out exactly on the sides of the sprite
});

// ---------- chapter 12: the harness as a loop ----------
test('chapter 12: the loop is made of the five terms of the closing sentence, read from it in both languages, and a sentence that does not list them stops the render', () => {
  const want = {
    es: { skills: 'skills', hooks: 'hooks', agents: 'agentes', workflows: 'workflows', prompts: '9 prompts', n: 9 },
    en: { skills: 'skills', hooks: 'hooks', agents: 'agents', workflows: 'workflows', prompts: '9 prompts', n: 9 },
  };
  for (const lang of ['es', 'en'] as const) {
    const close = STR[lang].pub.v3.instrCierre, L = loopOf(close);
    assert.deepEqual(L, want[lang], `${lang}: the five terms of «${close}»`);
    const at = [L.skills, L.hooks, L.agents, L.workflows, L.prompts].map((t) => close.indexOf(t));
    assert.ok(at.every((i) => i > 0) && at.every((i, k) => k === 0 || i > at[k - 1]!), `${lang}: every term is in the sentence, in the order it lists them`);
    assert.equal(L.n, Number(L.prompts.split(' ')[0]), 'the number of prompt ticks is the sentence\'s own');
  }
  // a sentence that is not «… — a, b, c, d y N e — …» is not drawn: nothing is made from a guess
  const bad = [
    'Incluye mi harness, sin lista entre rayas.',
    'Incluye mi harness — skills, hooks, agentes y 9 prompts — el mismo.',                                   // 4 terms
    'Incluye mi harness — skills, hooks, agentes, workflows, evals y 9 prompts — el mismo.',                 // 6 terms
    'Incluye mi harness — skills, hooks, agentes, workflows y prompts — el mismo.',                          // no count
    'Incluye mi harness — skills, hooks, agentes, workflows y 2 prompts — el mismo.',                        // fewer prompts than laps
    'Incluye mi harness — skills, hooks, agentes, workflows y 13 prompts — el mismo.',                       // more than it can light
    'Incluye mi harness — skills, hooks, agentes, workflows y 9.5 prompts — el mismo.',
    'Incluye mi harness — skills, hooks, agentes, workflows y nueve prompts — el mismo.',
  ];
  for (const s of bad) assert.throws(() => loopOf(s), /^Error: c12:/, s);
  // the clean twin, in the other language and with the most ticks it can light
  assert.deepEqual(loopOf('Includes my harness — skills, hooks, agents, workflows and 12 prompts — the same.'), { skills: 'skills', hooks: 'hooks', agents: 'agents', workflows: 'workflows', prompts: '12 prompts', n: 12 });
});

test('chapter 12: the loop\'s clocks hold together: three laps of four legs, the token home before the frame closes, every prompt lit before the loop is done', () => {
  assert.equal(LAPS, 3); assert.equal(C12_LAP, 4 * C12_T.leg); assert.ok(Math.abs(LAPS_END - (C12_T.t0 + LAPS * C12_LAP)) < 1e-12);
  assert.ok(Math.abs(C12_END - (LAPS_END + C12_T.frame0 + C12_T.frame + C12_T.tail)) < 1e-12);
  assert.ok(C12_END >= 4 && C12_END <= 8, `it plays for ${C12_END.toFixed(2)} s, once`);
  assert.equal(C12_T.dwell.length, 4, 'one dwell per corner');
  assert.ok(C12_T.dwell.every((d) => d >= 0 && C12_T.leg - d >= 0.15), 'on every leg the token is on its way for at least 0.15 s');
  assert.equal(Math.max(...C12_T.dwell), C12_T.dwell[1], 'it stands longest at the second corner, where the hooks fire around the work');
  // the beats: lap-major, strictly increasing, one leg apart, the final return is the end of the last lap
  const all: number[] = []; for (let k = 0; k < LAPS; k++) for (let j = 0; j < 4; j++) all.push(beat(k, j));
  assert.ok(all.every((b, i) => i === 0 || Math.abs(b - all[i - 1]! - C12_T.leg) < 1e-9), 'a beat every leg');
  assert.equal(beat(0, 0), C12_T.t0); assert.ok(Math.abs(beat(LAPS, 0) - LAPS_END) < 1e-12, 'lap 3\'s corner 0 is the final return');
  assert.ok(C12_T.frame0 > 0 && LAPS_END + C12_T.frame0 < C12_END, 'the frame closes after the token is home, with a rest after it');
  // the prompts: every size the sentence may have lights up in the laps, one after the other, at the third corner, and is lit before the loop is done
  for (let n = LAPS; n <= 12; n++) {
    const ts = Array.from({ length: n }, (_, i) => tickAt(i, n));
    assert.ok(ts.every((t, i) => i === 0 || t > ts[i - 1]!), `${n} prompts: lit one after the other`);
    ts.forEach((t, i) => { const k = Math.min(LAPS - 1, Math.floor((i * LAPS) / n)); assert.ok(t >= beat(k, 2) - 1e-9 && t < beat(k, 3), `${n} prompts: prompt ${i} lights while its lap's token is at or just past the third corner`); });
    assert.ok(ts[n - 1]! + 0.25 <= LAPS_END + 1e-9, `${n} prompts: the last one is fully lit before the token is home`);
  }
  const nine = Array.from({ length: 9 }, (_, i) => tickAt(i, 9)), g = (k: number, o: number) => beat(k, 2) + o * C12_T.tick;
  assert.deepEqual(nine.map((x) => +x.toFixed(6)), [g(0, 0), g(0, 1), g(0, 2), g(1, 0), g(1, 1), g(1, 2), g(2, 0), g(2, 1), g(2, 2)].map((x) => +x.toFixed(6)), '9 prompts light three by three, one group a lap');
  // the rule can fail: a pace of 0.2 s a prompt does not fit twelve prompts in the leg
  assert.ok(3 * 0.2 > C12_T.leg - 0.0001 || 11 * 0.2 > C12_T.leg);
});

test('chapter 12: the loop writes a style on 31 nodes in a whole pass (c12-data\'s table, one per prompt tick), under the 80 of the contract, and the markup holds the parts the table counts', () => {
  assert.equal(C12_BUDGET, 80, 'the budget of the contract');
  assert.equal(nodeCount(9), 31, 'the 22 of the table and the 9 ticks of the sentence');
  assert.equal(Object.values(C12_NODES).reduce((a, b) => a + b, 0) + 9, nodeCount(9));
  assert.ok(nodeCount(12) <= C12_BUDGET, 'even with the most ticks loopOf allows');
  const comp = readFileSync(new URL('../src/components/V3Loop.astro', import.meta.url), 'utf8'), count = (re: RegExp) => (comp.match(re) ?? []).length;
  assert.equal(count(/class="lp-e lp-e\d"/g), C12_NODES.edges); assert.equal(count(/class="lp-s lp-s\d"/g), C12_NODES.corners); assert.equal(count(/class="lp-p lp-p\d"/g), C12_NODES.pings);
  assert.equal(count(/class="lp-g lp-g\d"/g), C12_NODES.trail); assert.equal(count(/class="lp-k"/g), C12_NODES.token); assert.equal(count(/class="lp-wf"/g), C12_NODES.frame);
  assert.equal(count(/class="lp-c lp-(?:wl|ag|sk|hk|pl)"/g), C12_NODES.terms);
  assert.equal(count(/class="lp-t"/g), 1, 'the ticks are one markup line, as many times as the sentence says');
  // the rule can fail: a drawing of 60 ticks would go over (loopOf stops a sentence that asks for more than 12)
  assert.ok(nodeCount(60) > C12_BUDGET);
  assert.throws(() => loopOf('Includes my harness — skills, hooks, agents, workflows and 60 prompts — the same.'), /^Error: c12:/);
});

test('chapter 12: the drawing has no copy of its own (the component writes only the tag it is given and the terms it reads), it is a decoration, and nothing in it is round', () => {
  const comp = readFileSync(new URL('../src/components/V3Loop.astro', import.meta.url), 'utf8'), body = comp.slice(comp.indexOf('<div class="lp"'));
  let text = body; while (/\{[^{}]*\}/.test(text)) text = text.replace(/\{[^{}]*\}/g, '');
  assert.equal(text.replace(/<[^>]+>/g, '').replace(/\s+/g, ''), '', 'the markup of the drawing holds no text but expressions (the tag is the page\'s own ILUSTRATIVO, the terms are the sentence\'s)');
  assert.ok(/<p class="lp-tag"><i class="dot"><\/i><em>\{tag\}<\/em><\/p>/.test(comp) && /<div class="lp" data-loop aria-hidden="true">/.test(comp), 'the tag and aria-hidden are in the component');
  assert.ok(/const L = loopOf\(close\)/.test(comp), 'the terms come from the closing sentence');
  for (const t of ['workflows', 'agents', 'skills', 'hooks', 'prompts']) assert.ok(new RegExp(`>\\{L\\.${t}\\}<`).test(comp), `the ${t} chip says the sentence's term`);
  assert.ok(new RegExp(`--x:\\$\\{GEO\\.x\\}%;--y:\\$\\{GEO\\.y\\}%;--w:\\$\\{GEO\\.w\\}%;--h:\\$\\{GEO\\.h\\}%`).test(comp), 'the track stands where c12-data says (the effect reads the same numbers)');
  assert.deepEqual(C12_GEO, { x: 9, y: 27, w: 82, h: 44 });
  assert.ok(!/<img|<canvas|<video|<picture|<svg|<circle|<ellipse|border-radius|rx=/.test(comp), 'no image, no canvas, no round shape');
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const mine = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! })).filter((r) => /\.lp(?![\w-])|\.lp-[\w-]+/.test(r.sel));
  assert.ok(mine.length >= 28, `the drawing's rules are found (${mine.length})`);
  const round = (b: string) => /border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(b);
  for (const r of mine) assert.ok(!round(r.body), `«${r.sel}» is round`);
  // the chips are the drawing's only text: 10px at every width, the page's floor for mono labels (a clamp that went down to 8px once made them too small to read on a phone)
  const px = (b: string) => { const m = /(?:^|;)font(?:-size)?\s*:[^;]*?(clamp\([^)]*\)|\d+(?:\.\d+)?px)/.exec(b); return m ? m[1]! : null; };
  const sized = mine.filter((r) => px(r.body) !== null);
  assert.ok(sized.some((r) => r.sel === '.lp-c') && sized.some((r) => r.sel === '.lp-tag'), 'the chips\' and the tag\'s rules are found');
  for (const r of sized) assert.ok(/^\d/.test(px(r.body)!) && parseFloat(px(r.body)!) >= 10, `«${r.sel}» sets its text at ${px(r.body)}: a fixed size of 10px or more at every width`);
  assert.equal(px(mine.find((r) => r.sel === '.lp-c')!.body), '10px', 'the chips are 10px');
  // the rule can fail
  assert.ok(round('border-radius:50%;width:1px') && round('clip-path:circle(50%)') && !round('border:1px solid red;border-radius:0'));
  assert.equal(px('display:block;font:500 clamp(8px,2.5cqw,10px)/1 var(--m);color:red'), 'clamp(8px,2.5cqw,10px)'); assert.equal(px('font:500 8px/1 var(--m)'), '8px'); assert.equal(px('color:red'), null);
});

test('chapter 12\'s class names are its own: no rule outside its block styles an `lp` class, and the plate\'s grid puts the loop under the heading (wide) or after the text (narrow)', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*(?!!)[\s\S]*?\*\//g, '');
  const a = css.indexOf('.lp{grid-column:1'), tail = '.lp-pl{position:relative}', b = css.indexOf(tail);
  assert.ok(a > 0 && b > a, 'the chapter 12 block is where this test looks for it');
  const outside = css.slice(0, a) + css.slice(b + tail.length), inside = css.slice(a, b + tail.length);
  const NAMES = /\.lp(?![\w-])|\.lp-[\w-]+/;
  const stray = (t: string) => [...t.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())).filter((s) => NAMES.test(s));
  assert.deepEqual(stray(outside), [], 'a rule outside chapter 12\'s block styles one of its classes');
  const own = stray(inside).join(' ');
  for (const c of ['.lp', '.lp-tag', '.lp-fig', '.lp-wf', '.lp-c', '.lp-wl', '.lp-ag', '.lp-sk', '.lp-hk', '.lp-e', '.lp-s', '.lp-p', '.lp-k', '.lp-g', '.lp-b', '.lp-q', '.lp-t', '.lp-pl'])
    assert.ok(new RegExp(`${c.replace('.', '\\.')}(?![\\w-])`).test(own), `${c} is styled in the block`);
  // every class the component writes starts with lp (but `dot`, the page's shared one), so the check above covers the whole drawing
  const comp = readFileSync(new URL('../src/components/V3Loop.astro', import.meta.url), 'utf8'), cls = new Set([...comp.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
  cls.delete('dot'); assert.ok(cls.size >= 20 && [...cls].every((c) => /^lp(?:-|$)/.test(c)), `the component's classes are all lp-: ${[...cls].filter((c) => !/^lp(?:-|$)/.test(c))}`);
  // the plate: on a wide screen the loop takes the left column's second row (under the heading) and the text spans both rows of the right column; on a narrow one everything follows the text
  assert.ok(/\.bio-l\{grid-column:1;grid-row:1\}/.test(css) && /\.bio-h\{grid-column:2;grid-row:1 \/ span 2\}/.test(css) && /\.bio\{grid-template-rows:auto 1fr\}/.test(css), 'the wide plate\'s placement');
  assert.ok(/\.lp\{grid-column:1;grid-row:2;/.test(css), 'the loop is in the left column, second row');
  assert.ok(/@media \(max-width:900px\)\{\.bio\{grid-template-rows:none\}\.bio-l,\.bio-h,\.lp\{grid-column:1;grid-row:auto\}\}/.test(css), 'on a narrow screen the plate is one column again and every part flows in the order of the markup');
  // the rule can fail
  assert.deepEqual(stray('.lp-c{padding:8px}.x .lp-t{y:1}.foo{z:1}.lpx{a:1}'), ['.lp-c', '.x .lp-t']);
});

test('chapter 12: the effect writes only transform, opacity, clip-path and --fx-l, writes no copy and adds no node, plays once on c12-data\'s clocks, and is registered', () => {
  const src = readFileSync(new URL('../src/aegis/fx/c12v.ts', import.meta.url), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/\.style\.(?!opacity\b|transform\b|clipPath\b)\w+\s*=(?!=)/.test(code), 'it sets only style.opacity, style.transform and style.clipPath');
  assert.deepEqual([...new Set([...code.matchAll(/setProperty\('([^']+)'/g)].map((m) => m[1]))], ['--fx-l'], 'the one custom property it sets is --fx-l, how lit a term is');
  const wipes = [...code.matchAll(/wipe\(\[[^\]]*\]((?:,\s*'[^']+')+)\)/g)].flatMap((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!));
  assert.ok(wipes.length >= 6 && wipes.every((p) => ['opacity', 'transform', 'clip-path', '--fx-l'].includes(p)), `what it gives back are only those four (${[...new Set(wipes)]})`);
  assert.ok(!/textContent|innerText|innerHTML|insertAdjacent|createElement|appendChild|\.append\(|\.prepend\(|\.remove\(\)|cloneNode|replaceWith/.test(code), 'it writes no copy and adds, moves and removes no node');
  assert.ok(!/canvas|drawImage|fetch\(|\.webp|\.gif|\.apng/i.test(code), 'no footage, no sprite, no animated image');
  assert.ok(/import \{[^}]*\bEND\b[^}]*\bGEO\b[^}]*\} from '\.\.\/c12-data'/.test(src) && /duration: END\b/.test(code) && /x: END\b/.test(code), 'it plays for the END of c12-data');
  assert.ok(/once\(box!, undo/.test(code) && /REG\['c12:loop'\]/.test(code) && /margin:/.test(code), 'a play-once effect that asks once(), and shows itself to the review hooks');
  assert.ok(/CHAPTERS[^\n]*\['c12v', initC12V\]/.test(readFileSync(new URL('../src/aegis/fx/index.ts', import.meta.url), 'utf8')), 'the effect is registered in the list of chapters');
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), s = page.indexOf('<section id="c12"'), e = page.indexOf('<section id="c13"'), use = page.indexOf('<V3Loop close={V.instrCierre} tag={V.ilus} />');
  assert.ok(s > 0 && use > s && use < e, 'the page puts the drawing in chapter 12');
  assert.ok(page.indexOf('<p class="bio-close"', s) < use && use < page.indexOf('</div>\n</section>', s) + 1, 'after the text of the plate, still inside it');
});

// ---------- chapter 07: the pile ----------
test('chapter 07: the pile fills from the floor up, a row at a time and left to right, every chip falls in free fall to its place, and the number ends on the course\'s 40 (real token counts, both languages)', () => {
  const want = { es: [4, 5, 5, 4, 6, 5, 5, 4, 9, 5, 4, 6], en: [4, 5, 6, 5, 5, 5, 6, 4, 7, 5, 5, 5] };
  for (const lang of ['es', 'en'] as const) {
    const ks = modulos(lang).map((m) => piecesOf(TOKENS[lang], m.h).length);
    assert.deepEqual(ks, want[lang], `${lang}: the tokens of the twelve lesson titles, as the file has them today`);
    assert.equal(ks.reduce((a, b) => a + b, 0), 62);
    const P = c07Plan(ks);
    assert.equal(P.land.length, C07_ROWS); assert.deepEqual(P.land.map((r) => r.length), ks);
    // the bottom row (11) lands first, each row on top of the one before: every landing of a row is before the first of the row above it
    for (let r = C07_ROWS - 1; r >= 1; r--) assert.ok(P.land[r]![P.land[r]!.length - 1]! < P.land[r - 1]![0]!, `row ${r + 1} is complete before row ${r} starts`);
    // inside a row: left to right, one step apart
    P.land.forEach((row, r) => row.forEach((t, k) => { if (k) assert.ok(Math.abs(t - row[k - 1]! - C07_T.step) < 1e-9, `row ${r + 1}: a chip every ${C07_T.step} s`); }));
    assert.ok(Math.abs(P.times[0]! - (C07_T.lead + C07_T.tMax)) < 1e-12, 'the first chip to land is the bottom row\'s, after the longest fall');
    assert.ok(P.times.every((t, i) => i === 0 || t > P.times[i - 1]!), 'a landing at a time of its own');
    // nothing leaves the top edge before the effect starts (a chip's fall begins at its landing minus its fall time)
    P.land.forEach((row, r) => row.forEach((t) => assert.ok(t - c07Fall(r) >= C07_T.lead - 1e-12, `a chip of row ${r + 1} would leave the top edge before the lead`)));
    assert.ok(Math.abs(P.end - (P.last + Math.max(C07_T.flash, C07_T.squash) + C07_T.tail)) < 1e-12);
    assert.ok(P.end >= 2 && P.end <= 3.2, `it plays for ${P.end.toFixed(2)} s, once`);
    // the number: 0 until the first chip lands, never goes back, and is exactly the course's 40 once the last chip has landed
    assert.equal(c07Count(P, P.times[0]! - 1e-6, 40), 0); assert.equal(c07Count(P, P.last, 40), 40); assert.equal(c07Count(P, P.end, 40), 40);
    let prev = 0; for (let x = 0; x <= P.end; x += 0.01) { const n = c07Count(P, x, 40); assert.ok(n >= prev && n <= 40, `the count never goes back or past 40 (${n} at ${x.toFixed(2)})`); prev = n; }
  }
  // free fall: the time goes with the square root of the distance, and the rows are one pitch apart
  assert.ok(Math.abs(c07Fall(C07_ROWS - 1) - C07_T.tMax) < 1e-12);
  for (let r = 0; r < C07_ROWS; r++) assert.ok(Math.abs(c07Fall(r) - C07_T.tMax * Math.sqrt((r + 1) / C07_ROWS)) < 1e-12 && (r === 0 || c07Fall(r) > c07Fall(r - 1)), `row ${r + 1}'s fall`);
  assert.ok(Math.abs(c07Fall(2) / c07Fall(C07_ROWS - 1) - Math.sqrt(3 / 12)) < 1e-12, 'a quarter of the depth takes half the time');
  // a pile that is not twelve rows of at least one chip is not scheduled (nothing is made from a guess)
  assert.throws(() => c07Plan([4, 5, 5]), /c07:/); assert.throws(() => c07Plan([4, 5, 5, 4, 6, 5, 5, 4, 9, 5, 4, 0]), /c07:/); assert.throws(() => c07Plan([4, 5, 5, 4, 6, 5, 5, 4, 9, 5, 4, 6.5]), /c07:/);
  // the rule can fail: a pile that came in at 0.1 s a chip would take 6 s
  assert.ok(0.52 + 62 * 0.1 > 3.2);
});

test('chapter 07: the pile writes a style on one node per chip (62 of the contract\'s 80), and the markup is the finished pile of the real tokens, in the temario\'s order', () => {
  assert.equal(C07_BUDGET, 80, 'the budget of the contract');
  for (const lang of ['es', 'en'] as const) {
    const chips = modulos(lang).reduce((n, m) => n + piecesOf(TOKENS[lang], m.h).length, 0);
    assert.equal(c07Nodes(chips), 62); assert.ok(c07Nodes(chips) <= C07_BUDGET, `${lang}: ${chips} chips`);
  }
  assert.ok(c07Nodes(81) > C07_BUDGET, 'the rule can fail');
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), a = page.indexOf('<section id="c07"'), b = page.indexOf('<section id="c08"'), sec = page.slice(a, b);
  assert.ok(a > 0 && b > a, 'chapter 07 is where this test looks for it');
  assert.ok(/const pile = mods\.map\(\(m\) => piecesOf\(TOK, m\.h\)\);/.test(page), 'the rows are the real o200k pieces of the lesson titles, in the lessons\' order (no heuristic)');
  assert.ok(/data-fx="stack"/.test(sec) && /<div class="stk" data-pile aria-hidden="true">/.test(sec), 'the effect\'s name and a decoration (aria-hidden)');
  assert.ok(/\{pile\.map\(\(row\) => \(<div class="stk-r" data-row>\{row\.map\(\(p\) => \(<i class="stk-t">\{show\(p\[0\]\)\}<\/i>\)\)\}<\/div>\)\)\}/.test(sec), 'one row per lesson, one chip per piece, a leading space shown as «·» by show()');
  assert.ok(/<p class="stk-src">\{V\.tokReal\}<\/p>/.test(sec), 'it says what the chips are, with the page\'s own source label');
  assert.ok(/<div class="ctr"><b data-count="40">40<\/b><span>MIN<\/span><\/div>/.test(sec), 'the counter is the course\'s 40 MIN');
  assert.ok(!/<circle|<svg|<img|<canvas|border-radius/.test(sec), 'no ring, no circle, no image: nothing round');
  assert.ok(!/\bticks\b/.test(page.slice(0, page.indexOf('<!doctype html>'))), 'the ring\'s twelve ticks are gone from the frontmatter');
});

test('chapter 07 is square and its class names are its own: no round shape in an `stk` rule, no ring, clock or pen left in the stylesheet, and no rule outside the block styles an `stk` class but the effect\'s one', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*(?!!)[\s\S]*?\*\//g, '');
  assert.ok(!/\.clock\b|\.r0\b|\.r1\b|\.clock \.tick|\.pen\b|--fx-pen/.test(css), 'the ring, its ticks and its round pen are gone');
  const NAMES = /\.stk(?![\w-])|\.stk-[\w-]+/;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! })), mine = rules.filter((r) => r.sel.split(',').some((x) => NAMES.test(x)));
  assert.ok(mine.length >= 9, `the pile's rules are found (${mine.length})`);
  const round = (b: string) => /border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(b);
  for (const r of mine) assert.ok(!round(r.body), `«${r.sel}» is round`);
  // the chips are the pile's text: never under 10px, the page's floor for mono labels (an 8px floor made them too small to read on a phone). Their size is the pile's --tf, which starts at 10px; the source label is
  // 10px; and where the pile is narrower than 300px (a 320px phone gives it 288) the chips are padded tighter, which is what keeps the widest row (lesson 09) inside it at that size
  const floorOf = (t: string) => { const m = /--tf\s*:\s*clamp\(\s*(\d+(?:\.\d+)?)px\s*,/.exec(t); return m ? parseFloat(m[1]!) : null; };
  assert.ok((floorOf(css) ?? 0) >= 10, `--tf (the chips' text) never goes under 10px (${floorOf(css)})`);
  assert.ok(/\.stk-t\{[^}]*font:500 var\(--tf\)\/1 var\(--m\)/.test(css), 'the chips take their size from --tf');
  assert.ok(/\.stk-src\{[^}]*font:500 10px\//.test(css), 'the source label is 10px');
  assert.ok(/@container \(max-width:300px\)\{\.stk-t\{padding:0 \.35em\}\}/.test(css), 'on the narrowest phones the chips are padded tighter, so that the 10px floor still fits the widest row');
  const sized = (b: string) => { const m = /(?:^|;)font(?:-size)?\s*:[^;]*?(clamp\(\s*(\d+(?:\.\d+)?)px|(\d+(?:\.\d+)?)px)/.exec(b); return m ? parseFloat(m[2] ?? m[3]!) : null; };
  for (const r of mine) { const z = sized(r.body); if (z !== null) assert.ok(z >= 10, `«${r.sel}» sets its text at ${z}px`); }
  assert.ok(floorOf('.stk-rows{--tf:clamp(10px,3.1cqw,11px)}') === 10 && floorOf('.stk-rows{--tf:clamp(8px,3.1cqw,11px)}') === 8 && floorOf('.stk-rows{--tf:clamp(.6rem,3.1cqw,11px)}') === null && floorOf('.stk-rows{--tf:3.1cqw}') === null);
  assert.ok(sized('font:500 10px/1 var(--m)') === 10 && sized('font:500 8px/1 var(--m)') === 8 && sized('font:700 clamp(56px,6.4vw,96px)/1 var(--f)') === 56 && sized('font:500 var(--tf)/1 var(--m)') === null && sized('color:red') === null);
  const a = css.indexOf('.time{display:grid;grid-template-columns:minmax(0,340px)'), tail = '.stk .ctr span{', b = css.indexOf(tail);
  assert.ok(a > 0 && b > a, 'the chapter 07 block is where this test looks for it');
  const inside = css.slice(a, css.indexOf('}', b) + 1), outside = css.slice(0, a) + css.slice(css.indexOf('}', b) + 1);
  const stray = (t: string) => [...t.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((x) => x.trim())).filter((x) => NAMES.test(x));
  assert.deepEqual(stray(outside), ['html.fxl .stk[data-fx-s] .stk-t'], 'outside the block only the effect\'s own rule (the chips land on their bottom edge, keyed to html.fxl and the armed attribute) styles an stk class');
  const own = stray(inside).join(' ');
  for (const c of ['.stk', '.stk-src', '.stk-rows', '.stk-r', '.stk-t']) assert.ok(new RegExp(`${c.replace('.', '\\.')}(?![\\w-])`).test(own), `${c} is styled in the block`);
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), comp = page.slice(page.indexOf('<section id="c07"'), page.indexOf('<section id="c08"')), cls = new Set([...comp.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
  for (const c of ['stk', 'stk-src', 'stk-rows', 'stk-r', 'stk-t']) assert.ok(cls.has(c), `the markup uses ${c}`);
  // the rule can fail
  assert.deepEqual(stray('.stk-t{padding:8px}.x .stk{y:1}.foo{z:1}.stkx{a:1}'), ['.stk-t', '.x .stk']);
  assert.ok(round('border-radius:50%;width:1px') && round('clip-path:circle(50%)') && !round('border:1px solid red'));
});

test('chapter 07: the effect writes only transform, opacity and --fx-l, writes no copy but the counter\'s number, adds no node but its overlay, plays once on c07-data\'s clocks and is registered', () => {
  const src = readFileSync(new URL('../src/aegis/fx/c07.ts', import.meta.url), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/\.style\.(?!opacity\b|transform\b)\w+\s*=(?!=)/.test(code), 'it sets only style.opacity and style.transform');
  assert.deepEqual([...new Set([...code.matchAll(/setProperty\('([^']+)'/g)].map((m) => m[1]))], ['--fx-l'], 'the one custom property it sets is --fx-l, how lit a landed chip\'s outline is');
  const removed = [...code.matchAll(/\[((?:'[^']+',?\s*)+)\]\.forEach\(\(p\) => [\w.]+\.style\.removeProperty\(p\)\)/g)].flatMap((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!));
  assert.ok(removed.length >= 6 && removed.every((p) => ['opacity', 'transform', '--fx-l'].includes(p)), `what it gives back are only those three (${[...new Set(removed)]})`);
  assert.deepEqual([...code.matchAll(/\.textContent\s*=\s*([^;]+);/g)].map((m) => m[1]), ['String(k)'], 'the only text it writes is the counter\'s number, into its own overlay');
  assert.ok(!/innerHTML|innerText|insertAdjacent|appendChild\((?!ov)|\.append\(|\.prepend\(|cloneNode|replaceWith|createElement/.test(code), 'it adds no node but the counter\'s overlay (el(), appended to the number), moves none and removes none but that');
  assert.ok(!/canvas|drawImage|fetch\(|\.webp|\.gif|\.apng/i.test(code), 'no footage, no sprite, no animated image');
  assert.ok(/import \{[^}]*\bplan\b[^}]*\} from '\.\.\/c07-data'/.test(src) && /duration: P\.end\b/.test(code) && /x: P\.end\b/.test(code), 'it plays for the end of c07-data\'s plan');
  assert.ok(/once\(pile!, undo/.test(code) && /REG\['c07:stack'\]/.test(code) && /margin:/.test(code), 'a play-once effect that asks once(), and shows itself to the review hooks');
  assert.ok(/CHAPTERS[^\n]*\['c07', initC07\]/.test(readFileSync(new URL('../src/aegis/fx/index.ts', import.meta.url), 'utf8')), 'the effect is registered in the list of chapters');
  // the number is an overlay: the real text stays, transparent while it runs, and the overlay goes in the task the last number lands
  assert.ok(/ov = el\('i', 'fxk num'\)/.test(code) && /onComplete: done/.test(code), 'the counter overlay is made when the effect arms and removed when it is done');
});

test('chapter 09: the river runs in the order the title reads at one speed, its head (the last token) comes to rest first and each chip behind it comes to rest against the one in front, and no chip is ever over another (the real titles, both languages, every width of the title\'s box)', () => {
  // a 12px mono chip is 7.2 px a character plus 14 px of padding and border (the harness measures the real ones in three browsers); the box is 208 px (a 901px desktop) to 585 px (a tablet), the title starts 74 px (a phone) or 232 px (desktop) from the screen's edge
  const MONO = 7.2, PAD = 14, GAP = 3, LINE = 28, OUT = 24;
  const titles = (lang: 'es' | 'en') => modulos(lang).map((m) => piecesOf(TOKENS[lang], m.h).map((p) => show(p[0])));
  let cases = 0, minGapSeen = Infinity;
  for (const lang of ['es', 'en'] as const) for (const chips of titles(lang)) for (const maxW of [208, 259, 300, 344, 494, 585]) for (const left of [74, 232]) {
    const w = chips.map((t) => t.length * MONO + PAD), at = c09Wrap(w, maxW, GAP, LINE), n = w.length, dist = w.map((cw, k) => left + at.pos[k]![0] + cw + OUT), P = c09Plan(dist);
    assert.ok(Math.abs(Math.min(...P.set) - C09_T.lead) < 1e-9, 'the first chip sets off at the lead and no chip before it');
    // the head of the river is the title's LAST token: it comes to rest first, then each one before it, one pace apart (the river closes up behind its head)
    for (let k = 0; k < n - 1; k++) assert.ok(Math.abs(P.dock[k]! - P.dock[k + 1]! - C09_T.pace) < 1e-9, `${lang}: chip ${k} comes to rest ${C09_T.pace} s after chip ${k + 1}`);
    assert.ok(Math.abs(P.last - P.dock[0]!) < 1e-9 && Math.abs(P.m0 - (P.last + C09_T.hold)) < 1e-9 && Math.abs(P.end - (P.m0 + C09_T.merge)) < 1e-9, 'the clocks add up: the last chip at rest, the hold, the merge');
    assert.ok(P.end > 1 && P.end < 2.3, `a row plays for ${P.end.toFixed(2)} s, once`);
    // a chip waits OUT px beyond the screen's left edge: its right edge is at -OUT in the screen's coordinates (title box + offset - distance + width)
    w.forEach((cw, k) => assert.ok(Math.abs(left + at.pos[k]![0] - c09Chip(P, k, 0).r + cw + OUT) < 1e-9, `chip ${k} waits with its right edge ${OUT} px beyond the screen's left edge`));
    // the pictures, every 4 ms: nothing runs back, nothing runs faster than the river, nobody waiting is seen, and no two chips of a line touch
    const prev = dist.map((d) => d);
    for (let x = 0; x <= P.end + 0.004; x += 0.004) {
      const cs = dist.map((_, k) => c09Chip(P, k, x));
      cs.forEach((c, k) => {
        assert.ok(c.r >= 0 && c.r <= dist[k]! + 1e-9 && c.r <= prev[k]! + 1e-9, `chip ${k} never runs back (${c.r} after ${prev[k]})`);
        assert.ok(prev[k]! - c.r <= C09_T.speed * 0.004 + 1e-6, `chip ${k} never runs faster than the river: ${(prev[k]! - c.r) / 0.004} px/s`);
        if (x <= P.set[k]!) assert.ok(c.a === 0 && c.r === dist[k], `chip ${k} waits unseen until it sets off`);
        else if (x <= P.m0) assert.equal(c.a, 1, `chip ${k} is whole from its set-off to the merge`);
        prev[k] = c.r;
      });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (at.pos[i]![1] !== at.pos[j]![1] || cs[i]!.a <= 0 || cs[j]!.a <= 0) continue;
        const gap = (at.pos[j]![0] - cs[j]!.r) - (at.pos[i]![0] - cs[i]!.r + w[i]!);
        assert.ok(gap >= GAP - 1e-6, `${lang}, box ${maxW}: chips ${i} and ${j} are ${gap.toFixed(2)} px apart at ${x.toFixed(3)} s`); minGapSeen = Math.min(minGapSeen, gap);
      }
    }
    cases++;
  }
  assert.equal(cases, 2 * 12 * 6 * 2); assert.ok(Math.abs(minGapSeen - GAP) < 1e-6, `the closest two chips ever get is the 3 px of the finished title (${minGapSeen})`);
  // the chips of a title that wraps stand on lines 28 px apart (a chip is 24 px tall: no chip of one line touches another's)
  assert.ok(LINE >= 24 + 4);
});

test('chapter 09: the clocks of one row (the stop, the hold, the merge, the words coming back) and what the schedule refuses', () => {
  const P = c09Plan([400, 300, 250, 500, 340]);
  // a chip runs at one speed, then slows to a stop in T.stop: the stop covers speed * stop / 2 px, so the whole run takes distance / speed + stop / 2
  for (let k = 0; k < 5; k++) assert.ok(Math.abs(P.dock[k]! - P.set[k]! - c09Flight(P.dist[k]!)) < 1e-12 && Math.abs(c09Flight(P.dist[k]!) - (P.dist[k]! / C09_T.speed + C09_T.stop / 2)) < 1e-12);
  const k = 3, F = c09Flight(P.dist[k]!), at = (tau: number) => c09Chip(P, k, P.set[k]! + tau).r;
  assert.equal(at(-0.1), 500); assert.equal(at(0), 500); assert.equal(at(F), 0); assert.equal(at(F + 1), 0);
  assert.ok(Math.abs(at(0.1) - (500 - C09_T.speed * 0.1)) < 1e-9, 'one speed all along the river');
  const s0 = F - C09_T.stop; assert.ok(Math.abs(at(s0) - C09_T.speed * C09_T.stop / 2) < 1e-9, 'the stop begins where the speed leaves exactly speed * stop / 2 px to go');
  assert.ok(Math.abs(at(s0 + 1e-6) - at(s0) + C09_T.speed * 1e-6) < 1e-6, 'and it begins at the river\'s own speed (no jolt)');
  assert.ok(at(F - 1e-4) > 0 && at(F - 1e-4) / 1e-4 < 1, 'and it ends at rest (the speed is under 1 px/s a tenth of a millisecond before it stops)');
  // opacity: unseen until it sets off, whole until the merge, gone 70 % of the merge later; the words come back after the chips begin to go and are whole at the end
  assert.equal(c09Chip(P, 0, 0).a, 0); assert.equal(c09Chip(P, 0, P.m0).a, 1); assert.ok(Math.abs(c09Chip(P, 0, P.m0 + C09_T.merge * 0.35).a - 0.5) < 1e-9); assert.equal(c09Chip(P, 0, P.end).a, 0);
  assert.equal(c09Title(P, 0), 0); assert.equal(c09Title(P, P.m0 + C09_T.merge * 0.3), 0); assert.equal(c09Title(P, P.end), 1); assert.equal(c09Title(P, P.end + 5), 1);
  let prev = 0; for (let x = 0; x <= P.end; x += 0.005) { const t = c09Title(P, x); assert.ok(t >= prev && t >= 0 && t <= 1); prev = t; }
  // no chips: the words just come in (the narrowest phones, where a second line of chips would stand over the lesson's paragraph)
  assert.equal(c09Plain.dist.length, 0); assert.ok(Math.abs(c09Plain.end - (C09_T.lead + C09_T.merge)) < 1e-12); assert.equal(c09Title(c09Plain, 0), 0); assert.equal(c09Title(c09Plain, c09Plain.end), 1);
  // fail closed: no chips, a distance that is not a number, a run too short to stop in
  assert.throws(() => c09Plan([]), /c09:/); assert.throws(() => c09Plan([300, NaN]), /c09:/); assert.throws(() => c09Plan([300, Infinity]), /c09:/); assert.throws(() => c09Plan([300, -5]), /c09:/); assert.throws(() => c09Plan([300, 0]), /c09:/);
  assert.throws(() => c09Plan([300, (C09_T.speed * C09_T.stop) / 2]), /c09:/); assert.doesNotThrow(() => c09Plan([300, (C09_T.speed * C09_T.stop) / 2 + 1]));
  // wrap(): left to right in the title's box, a new line where the next chip would not fit, a chip wider than the box on a line of its own
  const w = c09Wrap([100, 100, 100], 250, 3, 28); assert.deepEqual(w.pos, [[0, 0], [103, 0], [0, 28]]); assert.equal(w.lines, 2); assert.equal(w.h, 56);
  assert.deepEqual(c09Wrap([300, 50], 250, 3, 28).pos, [[0, 0], [0, 28]]); assert.equal(c09Wrap([100, 100], 203, 3, 28).lines, 1, 'a chip that fits to the pixel stays on its line');
  // the rule can fail: a river that closed up at 0.2 s a chip would take more than the 2.3 s a row is allowed for the longest title (nine chips)
  assert.ok(C09_T.lead + 8 * 0.2 + 0.5 + C09_T.hold + C09_T.merge > 2.3);
});

test('chapter 09: the effect writes a style on one node per chip and one per title and adds one layer (75 of the contract\'s 80, however many rows are read one by one), and the markup is the temario as it was: twelve rows in the lessons\' order, nothing added to it', () => {
  assert.equal(C09_BUDGET, 80, 'the budget of the contract');
  for (const lang of ['es', 'en'] as const) {
    const chips = modulos(lang).reduce((n, m) => n + piecesOf(TOKENS[lang], m.h).length, 0);
    assert.equal(c09Nodes(chips, 12), 75); assert.ok(c09Nodes(chips, 12) <= C09_BUDGET, `${lang}: ${chips} chips, 12 titles and the layer`);
  }
  assert.ok(c09Nodes(68, 12) > C09_BUDGET, 'the rule can fail');
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), a = page.indexOf('<section id="c09"'), b = page.indexOf('<section id="c10"'), sec = page.slice(a, b);
  assert.ok(a > 0 && b > a, 'chapter 09 is where this test looks for it');
  assert.ok(/data-fx="group"/.test(sec) && !/data-flip|data-fx="flip"/.test(sec), 'the effect\'s name, and the Flip it replaced is gone');
  assert.ok(/\{mods\.map\(\(m\) => \(\s*<div class="irow" data-lesson=\{m\.n\}>/.test(sec), 'one row per lesson in the lessons\' order, each with its number as the hook');
  assert.ok(/<div class="ih">\{m\.h\}<\/div>/.test(sec), 'the title is the lesson\'s own text (the effect reads it)');
  assert.ok(!/\birt\b|\birv\b|fxk/.test(sec), 'the chips and their layer are the effect\'s: the server renders none of them');
  assert.ok(!/<circle|<svg|<img|<canvas|border-radius/.test(sec), 'nothing round, no image');
  assert.equal(modulos('es').length, 12); assert.deepEqual(modulos('es').map((m) => m.n), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
});

test('chapter 09 is square and its class names are its own: no round shape in an `irt` or `irv` rule, the chips\' text is 10px or more at every width, and every rule of them hangs on html.fxl', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*(?!!)[\s\S]*?\*\//g, '');
  const NAMES = /\.irt(?![\w-])|\.irv(?![\w-])/;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! })), mine = rules.filter((r) => r.sel.split(',').some((x) => NAMES.test(x)));
  assert.equal(mine.length, 3, 'the layer, the chip, and the chip on a narrow phone');
  const round = (b: string) => /border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(b);
  for (const r of mine) { assert.ok(!round(r.body), `«${r.sel}» is round`); assert.ok(/^(?:@media[^{]*\{)?\s*html\.fxl /.test(r.sel) || r.sel.startsWith('html.fxl '), `«${r.sel}» is not keyed to html.fxl (it would outlive dispose())`); assert.ok(!/transition|animation|will-change|filter|box-shadow|text-shadow/.test(r.body), `«${r.sel}»: the effect moves the chips, the stylesheet does not`); }
  // the text: 12px, and 10px on a phone (the page's floor for mono labels); the chips stand in the title's box, which is 230 px wide on a 320px phone and 300 on a 390
  const sized = (b: string) => { const m = /(?:^|;)font(?:-size)?\s*:[^;]*?(\d+(?:\.\d+)?)px/.exec(b); return m ? parseFloat(m[1]!) : null; };
  const chip = mine.find((r) => /^html\.fxl \.irt$/.test(r.sel)), narrow = mine.find((r) => /\.irt$/.test(r.sel) && r !== chip);
  assert.ok(chip && sized(chip.body) === 12 && /position:absolute/.test(chip.body) && /height:24px/.test(chip.body) && /white-space:nowrap/.test(chip.body), 'the chip: 12px mono, 24px tall, never wrapping');
  assert.ok(narrow && sized(narrow.body) === 10 && /padding:0 \.35em/.test(narrow.body), 'on a phone: 10px, padded tighter');
  assert.ok(css.includes('@media (max-width:480px){html.fxl .irt{'), 'at 480px and under');
  for (const r of mine) { const z = sized(r.body); if (z !== null) assert.ok(z >= 10, `«${r.sel}» sets its text at ${z}px`); }
  assert.ok(sized('font:500 10px/1 var(--m)') === 10 && sized('font:500 9px/1 var(--m)') === 9 && sized('font-size:8px') === 8 && sized('color:red') === null);
  const layer = mine.find((r) => /\.irv$/.test(r.sel));
  assert.ok(layer && /position:absolute/.test(layer.body) && /width:0/.test(layer.body) && /height:0/.test(layer.body) && /pointer-events:none/.test(layer.body), 'the layer is a point at the corner of its box, and never takes a click');
  assert.ok(!/html\.fxl \.idx\s*\{/.test(css), 'the list is not positioned by the stylesheet (the effect measures the corner of the layer, wherever the page puts it)');
  const stray = (t: string) => [...t.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((x) => x.trim())).filter((x) => NAMES.test(x));
  assert.deepEqual(stray(css), ['html.fxl .irv', 'html.fxl .irt', 'html.fxl .irt'], 'no other rule of the stylesheet styles an `irt` or `irv`');
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8');
  assert.ok(!/class="[^"]*\b(?:irt|irv)\b/.test(page), 'and the page uses neither class: they are the effect\'s');
  // the rule can fail
  assert.deepEqual(stray('.irt{padding:8px}.x .irv{y:1}.foo{z:1}.irtx{a:1}'), ['.irt', '.x .irv']);
  assert.ok(round('border-radius:50%;width:1px') && round('clip-path:circle(50%)') && !round('border:1px solid red'));
});

test('chapter 09: the effect writes only transform and opacity, adds no node but the chips and their layer, writes no copy but a token\'s own text, plays each row once on c09-data\'s clocks, gives a row back whole when anything fails, and is registered', () => {
  const src = readFileSync(new URL('../src/aegis/fx/c09.ts', import.meta.url), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/\.style\.(?!opacity\b|transform\b)\w+\s*=(?!=)/.test(code), 'it sets only style.opacity and style.transform');
  assert.ok(!/setProperty\(/.test(code), 'it sets no custom property');
  assert.deepEqual([...new Set([...code.matchAll(/style\.removeProperty\('([^']+)'\)/g)].map((m) => m[1]))], ['opacity'], 'what it gives back is the title\'s opacity');
  assert.deepEqual([...code.matchAll(/\.textContent\s*=\s*([^;]+);/g)].map((m) => m[1]), ['p'], 'the only text it writes is a token piece, read from the page\'s own token file');
  assert.ok(/piecesOf\(map, ih\.textContent \?\? ''\)\.map\(\(p\) => show\(p\[0\]\)\)/.test(code) && /tokensFromPage\(\)/.test(code), 'the pieces are the real ones, a leading space shown as «·» by show()');
  assert.deepEqual([...code.matchAll(/\bel\('([a-z]+)', '([^']+)'\)/g)].map((m) => `${m[1]}.${m[2]}`), ['div.fxk irv', 'i.fxk irt'], 'the nodes it adds: its layer and its chips, both marked fxk');
  assert.ok(/layer\.setAttribute\('aria-hidden', 'true'\)/.test(code), 'and the layer is a decoration (aria-hidden)');
  assert.ok(!/innerHTML|innerText|insertAdjacent|\.prepend\(|cloneNode|replaceWith|createElement|createTextNode/.test(code), 'it moves no node and writes no markup');
  assert.ok(!/canvas|drawImage|fetch\(|\.webp|\.gif|\.apng/i.test(code), 'no footage, no sprite, no animated image');
  assert.ok(/import \{[^}]*\bplan\b[^}]*\} from '\.\.\/c09-data'/.test(src) && /duration: s\.plan\.end\b/.test(code) && /x: s\.plan\.end\b/.test(code), 'it plays for the end of c09-data\'s plan');
  assert.ok(/once\(l\.row, undo/.test(code) && /REG\[`c09:\$\{l\.n\}`\]/.test(code) && /margin:/.test(code), 'every row is a play-once effect that asks once(), and shows itself to the review hooks');
  assert.ok(/CHAPTERS[^\n]*\['c09', initC09\]/.test(readFileSync(new URL('../src/aegis/fx/index.ts', import.meta.url), 'utf8')), 'the effect is registered in the list of chapters');
  // a row whose picture cannot be drawn, or whose chips cannot be placed, is given back whole (fail open), and a width change gives back the rows that are playing
  assert.ok(/catch \(e\) \{ off\(e\); \}/.test(code) && /const off = \(e: unknown\) => \{ console\.warn\([^;]*; done\(\); \}/.test(code), 'a failure is a warning and the row given back whole');
  assert.ok(/onWidth\(\(\) => \{[^}]*state\(\) === 'run'[^}]*\.clear\(\)/.test(code), 'a width change gives back the rows that are playing');
  assert.ok(/plain/.test(code) && /P\.top - H\.top < at\.h - LINES/.test(code), 'a title whose chips would stand over the paragraph under it has no chips');
  assert.ok(/onComplete: done/.test(code) && /const clear = \(l: Lesson\) => \{[^}]*s\.chips\.forEach\(\(c\) => c\.remove\(\)\); runs\.delete\(l\);/.test(code), 'the chips are removed in the very task the row is done (clear() is what once() calls then)');
  assert.ok(/const release = \(\) => \{ if \(layer && !layer\.firstChild && ones\.every\(\(o\) => o\.state\(\) === 'static'\)\) \{ layer\.remove\(\);/.test(code), 'the one layer is kept while any row is waiting or playing (a list read row by row makes one layer, not twelve) and goes with the last row');
});

// ---------- chapter 13: the two lists made by sorting a pile of their real tokens ----------
const c13Lines = (lang: 'es' | 'en') => {
  const V = STR[lang].pub.v3;
  return [...(V.s10Si as unknown as string[]).map((t) => ({ t, list: 'yes' as const })), ...(V.s10No as unknown as string[]).map((t) => ({ t, list: 'no' as const }))].map((l) => ({ ...l, pieces: piecesOf(TOKENS[lang], l.t) }));
};
/** A made-up page for the schedule: the seven lines as units of mono chips (7.2 px a character plus 14 of padding, 3 px between two chips of a unit), the two lists side by side (yes left, no right) or stacked, the pile
 *  on the border between the columns or at the junction of the two blocks. */
function c13Page(lang: 'es' | 'en', width: number, side: boolean): { specs: C13Spec[]; geo: C13Geo } {
  const MONO = 7.2, PAD = 14, GAP = 3, H = 24, ROW = 72, specs: C13Spec[] = [], box: Array<{ w: number; h: number }> = [], rest: Array<{ x: number; y: number }> = [], lineC: Array<[number, number]> = [];
  c13Lines(lang).forEach((l, item) => {
    const n = l.list === 'yes' ? item : item - 4, left = side ? (l.list === 'yes' ? 40 : width / 2 + 40) : 20, y = side ? 100 + n * ROW : l.list === 'yes' ? 100 + n * ROW : 100 + 4 * ROW + 60 + n * ROW;
    let x = left;
    c13Units(l.pieces).forEach((u) => {
      const chips = l.pieces.slice(u.first, u.last + 1).map((p) => show(p[0])), w = chips.reduce((a, c) => a + c.length * MONO + PAD, 0) + (chips.length - 1) * GAP;
      specs.push({ item, chips: chips.length, list: l.list }); box.push({ w, h: H }); rest.push({ x, y }); x += w + 6;
    });
    lineC[item] = [left + 180, y + H / 2];
  });
  const pile = side ? { x: width / 2, y: 330, hx: 150, hy: 90 } : { x: width / 2, y: 100 + 4 * ROW + 30, hx: 90, hy: 110 };
  return { specs, geo: { pile, box, rest, dist: lineC.map(([x, y]) => Math.hypot(x - pile.x, y - pile.y)) } };
}

test('chapter 13: the units are runs of at most two real tokens (a unit\'s chips are its two pseudo-elements) cut at word boundaries, a longer word cut into runs of two, they join back into each line, and there are 51 (ES) and 45 (EN) of them for 91 and 85 tokens', () => {
  const totals: Record<string, [number, number]> = { es: [0, 0], en: [0, 0] };
  for (const lang of ['es', 'en'] as const) for (const l of c13Lines(lang)) {
    const us = c13Units(l.pieces), w = wordsOf(l.pieces);
    assert.equal(us[0]!.first, 0); assert.equal(us[us.length - 1]!.last, l.pieces.length - 1);
    us.forEach((u, i) => {
      if (i) {
        assert.equal(u.first, us[i - 1]!.last + 1, 'the units are contiguous, none lost, none twice');
        // a unit starts in the middle of a word only when that word has more tokens than a unit holds
        if (w[u.first] === w[us[i - 1]!.last]) assert.ok(l.pieces.filter((_, j) => w[j] === w[u.first]).length > C13_CAP, `${lang}: a unit starts in the middle of a word of ${C13_CAP} tokens or fewer «${l.t}»`);
      }
      assert.ok(u.chips >= 1 && u.chips <= C13_CAP, 'a unit has one or two chips, never more than it has pseudo-elements');
      assert.equal(u.chips, u.last - u.first + 1);
      // where its words stand in the line's text: the unit's tokens joined, without the space the first one begins with
      const joined = l.pieces.slice(u.first, u.last + 1).map((p) => p[0]).join('').replace(/^ /, '');
      assert.equal(l.t.slice(u.start, u.end), joined, `${lang}: the text of «${l.t}» between ${u.start} and ${u.end}`);
    });
    totals[lang]![0] += us.length; totals[lang]![1] += l.pieces.length;
  }
  assert.deepEqual(totals, { es: [51, 91], en: [45, 85] }, 'units and tokens in the seven lines (two Spanish words of three tokens are cut into two units each)');
  // the rule: runs of CAP, cut at word boundaries; a word of more tokens than that is cut into runs of CAP (the only place a word is cut)
  const P = (...t: string[]): Array<[string]> => t.map((x) => [x]);
  assert.deepEqual(c13Units(P('Usas', ' Chat', 'G', 'PT')).map((u) => [u.first, u.last]), [[0, 0], [1, 2], [3, 3]]);
  assert.deepEqual(c13Units(P(' ab', 'c', 'd', 'e', 'f')).map((u) => [u.first, u.last]), [[0, 1], [2, 3], [4, 4]], 'a word of five tokens is three units');
  assert.deepEqual(c13Units(P(' ab', 'c', 'd', ' e')).map((u) => [u.first, u.last, u.start, u.end]), [[0, 1, 1, 4], [2, 2, 4, 5], [3, 3, 6, 7]], 'a word of three tokens is cut after two, and where each run\'s words stand in « abcd e» (the space a word begins with is not drawn)');
  assert.deepEqual(c13Units(P('a', ' b', ' c')).map((u) => [u.first, u.last]), [[0, 1], [2, 2]]);
  assert.deepEqual(c13Units(P('a', ' bb', 'x', ' c')).map((u) => [u.first, u.last]), [[0, 0], [1, 2], [3, 3]]);
  assert.deepEqual(c13Units(P('hola', '.')).map((u) => [u.start, u.end]), [[0, 5]], 'punctuation sticks to the word before it');
  assert.deepEqual(c13Units(P('a', ' b')).map((u) => [u.start, u.end]), [[0, 3]], 'the space a token begins with is not part of where its words stand');
  assert.throws(() => c13Units([]), /c13:/);
  assert.equal(C13_CAP, 2);
});

test('chapter 13: the schedule (the real lines, both languages, two stacked widths and two side by side): the pile forms and stands complete and mixed, the line nearest the pile goes first, each unit runs on a straight line to its words and fades as it arrives, and the words come in with it', () => {
  let cases = 0;
  for (const lang of ['es', 'en'] as const) for (const [width, side] of [[390, false], [768, false], [1024, true], [1440, true]] as const) {
    const { specs, geo } = c13Page(lang, width, side), P = c13Plan(specs, geo), n = specs.length, items = 7;
    // the order of the lines: the nearest to the pile first (a permutation: every line has a turn)
    assert.deepEqual([...P.rank].sort((a, b) => a - b), Array.from({ length: items }, (_, i) => i));
    for (let i = 0; i < items; i++) for (let j = 0; j < items; j++) if (geo.dist[i]! < geo.dist[j]!) assert.ok(P.rank[i]! < P.rank[j]!, `${lang} ${width}: line ${i} is nearer the pile than line ${j} and goes first`);
    const within: number[] = [], seen = new Array(items).fill(0); specs.forEach((s, k) => { within[k] = seen[s.item]!++; });
    for (let k = 0; k < n; k++) {
      const rel = C13_T.form + C13_T.hold + P.rank[specs[k]!.item]! * C13_T.item + within[k]! * C13_T.unit;
      assert.ok(Math.abs(P.rel[k]! - rel) < 1e-12 && Math.abs(P.land[k]! - (rel + C13_T.fly)) < 1e-12, 'a unit runs after the pile has formed and stood, in its line\'s turn, a unit apart in the order the line reads');
      assert.ok(P.appear[k]! >= 0 && P.appear[k]! <= C13_T.form - C13_T.pop + 1e-12, 'a unit has come into the pile by the end of the formation');
      assert.deepEqual(P.to[k], [geo.rest[k]!.x, geo.rest[k]!.y]);
      // it comes into the pile at a place inside the pile's ellipse (box centred on a point of it)
      const cx = P.from[k]![0] + geo.box[k]!.w / 2 - geo.pile.x, cy = P.from[k]![1] + geo.box[k]!.h / 2 - geo.pile.y;
      assert.ok((cx / geo.pile.hx) ** 2 + (cy / geo.pile.hy) ** 2 <= 1 + 1e-9, 'inside the pile');
    }
    assert.ok(Math.min(...P.rel) >= C13_T.form + C13_T.hold - 1e-12, 'nothing leaves before the pile has stood');
    // the pile stands complete between the formation and the first run
    for (const x of [C13_T.form, C13_T.form + C13_T.hold / 2, C13_T.form + C13_T.hold]) for (let k = 0; k < n; k++) { const u = c13Unit(P, k, x); assert.ok(u.a === 1 && u.x === P.from[k]![0] && u.y === P.from[k]![1], `${lang}: unit ${k} stands whole in the pile at ${x}`); }
    // the pile is mixed: the two lists alternate along its stacking, and the first half of it is not one list's
    const order = P.order, runs = order.reduce((m, k, i) => m + (i && specs[k]!.list === specs[order[i - 1]!]!.list ? 0 : 1), 0), half = order.slice(0, Math.floor(n / 2)).filter((k) => specs[k]!.list === 'yes').length / Math.floor(n / 2);
    assert.ok(runs >= n / 4 && half > 0.3 && half < 0.7, `${lang}: the lists alternate ${runs} times in a pile of ${n}, ${(half * 100).toFixed(0)} % of its first half is yes`);
    assert.deepEqual(c13Pile(n).order, order); assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: n }, (_, k) => k));
    // every picture, every 4 ms: a straight line from the pile to the words, never back; opacity 0 until it comes in, whole until it nears its words, 0 once it has arrived
    for (let k = 0; k < n; k++) {
      const a = P.from[k]!, b = P.to[k]!, d = [b[0] - a[0], b[1] - a[1]], len2 = d[0] * d[0] + d[1] * d[1] || 1;
      let prevT = 0, prevA = 0, maxA = 0;
      for (let x = 0; x <= P.end + 0.004; x += 0.004) {
        const u = c13Unit(P, k, x), p = [u.x - a[0], u.y - a[1]], t = (p[0] * d[0] + p[1] * d[1]) / len2;
        assert.ok(t >= -1e-9 && t <= 1 + 1e-9 && Math.abs(p[0] * d[1] - p[1] * d[0]) / Math.sqrt(len2) < 1e-6, 'on the line from the pile to its words');
        assert.ok(t >= prevT - 1e-9, `unit ${k} never runs back`); prevT = t;
        assert.ok(u.a >= 0 && u.a <= 1, 'opacity is a share');
        if (x <= P.appear[k]!) assert.equal(u.a, 0, 'unseen until it comes into the pile');
        if (x >= P.land[k]! + C13_T.fade * 0.4) assert.equal(u.a, 0, 'gone once it has arrived');
        if (x >= P.appear[k]! + C13_T.pop && x <= P.land[k]! - C13_T.fade * 0.6) assert.equal(u.a, 1, 'whole from its coming in to its arrival');
        if (x >= P.land[k]! - C13_T.fade * 0.6) assert.ok(u.a <= prevA + 1e-12, 'only fading once it nears its words');
        prevA = u.a; maxA = Math.max(maxA, u.a);
      }
      assert.equal(maxA, 1);
      { const u = c13Unit(P, k, P.land[k]!); assert.ok(Math.abs(u.x - b[0]) < 1e-9 && Math.abs(u.y - b[1]) < 1e-9, 'it arrives at the place of its words'); }
    }
    // the words of a line come in as its units arrive: from T.text before the first one lands, whole when the last has faded, never going back
    for (let i = 0; i < items; i++) {
      const ks = specs.map((s, k) => (s.item === i ? k : -1)).filter((k) => k >= 0), first = Math.min(...ks.map((k) => P.land[k]!)), last = Math.max(...ks.map((k) => P.land[k]!));
      assert.ok(Math.abs(P.text[i]![0] - (first - C13_T.text)) < 1e-12 && Math.abs(P.text[i]![1] - (last + C13_T.fade / 2)) < 1e-12);
      assert.equal(c13Text(P, i, 0), 0); assert.equal(c13Text(P, i, P.text[i]![1]), 1); assert.equal(c13Text(P, i, P.end + 3), 1);
      let prev = 0; for (let x = 0; x <= P.end; x += 0.004) { const t = c13Text(P, i, x); assert.ok(t >= prev - 1e-12 && t >= 0 && t <= 1); prev = t; }
    }
    assert.ok(P.end > 1.8 && P.end < 2.4, `${lang} ${width}: it plays for ${P.end.toFixed(2)} s, once`);
    // the units of a line arrive one after the other in the order it reads
    for (let k = 1; k < n; k++) if (specs[k]!.item === specs[k - 1]!.item) assert.ok(P.land[k]! > P.land[k - 1]! && P.rel[k]! > P.rel[k - 1]!, `${lang}: unit ${k} arrives after the unit before it in its line`);
    // the clocks are where the design needs them: a pile that takes a moment to form and stands for a moment, a run long enough to be seen, the words coming in before the first unit lands
    assert.ok(C13_T.form >= 0.25 && C13_T.hold >= 0.15 && C13_T.fly >= 0.4 && C13_T.fly <= 0.9 && C13_T.item >= 0.05 && C13_T.unit >= 0.01 && C13_T.text >= 0.1 && C13_T.fade >= 0.1 && C13_T.pop >= 0.05 && C13_T.pop <= C13_T.form, 'the clocks');
    assert.ok(Math.abs(P.end - Math.max(...P.land.map((l) => l + C13_T.fade / 2))) < 1e-12);
    cases++;
  }
  assert.equal(cases, 8);
  // the rule can fail: a pile that formed in 3 s would not leave the 2.4 s the whole is allowed
  assert.ok(3 + C13_T.hold + 6 * C13_T.item + 9 * C13_T.unit + C13_T.fly > 2.4);
});

test('chapter 13: the clocks of one unit (its run, its fade, the words) and what the schedule refuses', () => {
  const { specs, geo } = c13Page('es', 1440, true), P = c13Plan(specs, geo), k = 3, at = (x: number) => c13Unit(P, k, x);
  const a = P.from[k]!, b = P.to[k]!, mid = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  assert.deepEqual([at(P.rel[k]! - 0.3).x, at(P.rel[k]! - 0.3).y], a); assert.deepEqual([at(P.rel[k]!).x, at(P.rel[k]!).y], a);
  assert.ok(mid(at(P.rel[k]! + C13_T.fly / 2).x, (a[0] + b[0]) / 2) && mid(at(P.rel[k]! + C13_T.fly / 2).y, (a[1] + b[1]) / 2), 'halfway through its run it is halfway there (an ease in and out)');
  assert.ok(Math.hypot(at(P.rel[k]! + C13_T.fly * 0.1).x - a[0], at(P.rel[k]! + C13_T.fly * 0.1).y - a[1]) < 0.1 * Math.hypot(b[0] - a[0], b[1] - a[1]), 'it leaves the pile slowly: a tenth of the way through its run it has covered less than a tenth of the way');
  const e = (u: number) => u * u * (3 - 2 * u); assert.ok(mid(at(P.rel[k]! + C13_T.fly * 0.25).x, a[0] + (b[0] - a[0]) * e(0.25)), 'a smooth step: slow out of the pile, slow into its place');
  assert.ok(mid(at(P.appear[k]! + C13_T.pop / 2).a, 0.5) && at(P.appear[k]!).a === 0 && at(P.appear[k]! + C13_T.pop).a === 1, 'it comes into the pile over T.pop');
  assert.ok(mid(at(P.land[k]! - C13_T.fade * 0.1).a, 0.5) && at(P.land[k]! - C13_T.fade * 0.6).a === 1 && at(P.land[k]! + C13_T.fade * 0.4).a === 0, 'and fades out around the second it arrives, T.fade long');
  const t = P.text[2]!; assert.equal(c13Text(P, 2, t[0]), 0); assert.ok(mid(c13Text(P, 2, (t[0] + t[1]) / 2), 0.5)); assert.equal(c13Text(P, 2, t[1]), 1);
  // fail closed: no units, lines that do not count up one at a time, a unit with no chip or with more than the two its pseudo-elements draw, geometry that does not describe the units, a number that is not a number, a pile with no size
  type MutGeo = { pile: C13Geo['pile']; box: Array<{ w: number; h: number }>; rest: Array<{ x: number; y: number }>; dist: number[] };
  const bad = (f: (s: C13Spec[], g: MutGeo) => [C13Spec[], C13Geo]) => assert.throws(() => c13Plan(...f(specs.map((x) => ({ ...x })), { ...geo, box: [...geo.box], rest: [...geo.rest], dist: [...geo.dist] })), /c13:/);
  assert.throws(() => c13Plan([], { pile: geo.pile, box: [], rest: [], dist: [] }), /c13:/);
  assert.throws(() => c13Plan([], geo), /c13:/);
  bad((s, g) => { s[0]!.item = 1; return [s, g]; });
  bad((s, g) => { s[s.length - 1]!.item = 9; return [s, g]; });
  bad((s, g) => { s[2]!.chips = 0; return [s, g]; });
  bad((s, g) => { s[2]!.chips = 1.5; return [s, g]; });
  bad((s, g) => { s[2]!.chips = C13_CAP + 1; return [s, g]; });
  bad((s, g) => [s, { ...g, box: g.box.slice(1) }]);
  bad((s, g) => [s, { ...g, rest: g.rest.slice(1) }]);
  bad((s, g) => [s, { ...g, dist: g.dist.slice(1) }]);
  bad((s, g) => { g.rest[1] = { x: NaN, y: 0 }; return [s, g]; });
  bad((s, g) => { g.box[1] = { w: 0, h: 24 }; return [s, g]; });
  bad((s, g) => { g.dist[1] = Infinity; return [s, g]; });
  bad((s, g) => [s, { ...g, pile: { ...g.pile, hx: 0 } }]);
  bad((s, g) => [s, { ...g, pile: { ...g.pile, y: NaN } }]);
  assert.doesNotThrow(() => c13Plan(specs, geo));
  assert.equal(C13_SEED, 13);
});

test('chapter 13: a pass adds one layer and one element per unit and writes a style on those and on the seven lines (59 and 53 of the contract\'s 80: a unit\'s chips are pseudo-elements, no node), and the markup is the two lists as they were: nothing added to it', () => {
  assert.equal(C13_BUDGET, 80, 'the budget of the contract');
  for (const [lang, units, tokens] of [['es', 51, 91], ['en', 45, 85]] as const) {
    const us = c13Lines(lang).reduce((m, l) => m + c13Units(l.pieces).length, 0);
    assert.equal(us, units); assert.equal(c13Nodes(us, 7), units + 8); assert.ok(c13Nodes(us, 7) <= C13_BUDGET, `${lang}: ${us} units, 7 lines and the layer`);
    // the reason for units whose chips are pseudo-elements: the contract's counter counts every element ADDED, so an element per token (and 7 lines and the layer) is over the budget
    assert.ok(c13Nodes(tokens, 7) > C13_BUDGET, `${lang}: ${tokens} tokens as one element each (and 7 lines and the layer) would be ${c13Nodes(tokens, 7)}`);
    // and one per unit with a chip element inside it is over it too (the counter finds the chips as descendants of the added unit)
    assert.ok(us + tokens + 7 + 1 > C13_BUDGET, `${lang}: a unit element with a chip element in it per token would be ${us + tokens + 8}`);
  }
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8'), a = page.indexOf('<section id="c13"'), b = page.indexOf('<section id="c14"'), sec = page.slice(a, b);
  assert.ok(a > 0 && b > a, 'chapter 13 is where this test looks for it');
  assert.ok(/data-fx="separate"/.test(sec) && !/split-in/.test(sec), 'the effect\'s name, and the old one is gone');
  assert.ok(/<div class="pcol yes" data-col="yes"><h2>\{V\.s10TituloSi\}<\/h2><ul>\{V\.s10Si\.map\(\(x\) => \(<li>\{x\}<\/li>\)\)\}<\/ul><\/div>/.test(sec), 'the yes column: its heading and one plain <li> per line (the effect reads each line\'s one text node)');
  assert.ok(/<div class="pcol no" data-col="no"><h2>\{V\.s10TituloNo\}<\/h2><ul>\{V\.s10No\.map\(\(x\) => \(<li>\{x\}<\/li>\)\)\}<\/ul><\/div>/.test(sec), 'and the no column');
  assert.ok(/<div class="para">/.test(sec), 'the two columns are in one block');
  assert.ok(!/\bssu\b|\bsst\b|\bssv\b|fxk|data-t[12]/.test(sec), 'the units, their chips (pseudo-elements read from data-t1 and data-t2) and their layer are the effect\'s: the server renders none of them');
  assert.ok(!/<circle|<svg|<img|<canvas|border-radius/.test(sec), 'nothing round, no image');
  for (const lang of ['es', 'en'] as const) { const V = STR[lang].pub.v3; assert.equal(V.s10Si.length, 4); assert.equal(V.s10No.length, 3); }
});

test('chapter 13 is square and its class names are its own: no round shape in an `ssv` or `ssu` rule or in the pseudo-elements that are a unit\'s chips, their text is 10px or more at every width and is read from the unit\'s own data attributes, and every rule of them hangs on html.fxl', () => {
  const css = readFileSync(new URL('../src/aegis/v3.css', import.meta.url), 'utf8').replace(/\/\*(?!!)[\s\S]*?\*\//g, '');
  const NAMES = /\.ssv(?![\w-])|\.ssu(?![\w-])|\.sst(?![\w-])/;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! })), mine = rules.filter((r) => r.sel.split(',').some((x) => NAMES.test(x)));
  assert.equal(mine.length, 7, 'the layer, the unit, the chips, the first chip\'s text, the second chip\'s text, the yes list\'s chips, and the chips on a narrow phone');
  const round = (b: string) => /border-radius\s*:\s*(?!0(?:px)?\s*(?:;|$))|clip-path\s*:\s*(?:circle|ellipse)/i.test(b);
  for (const r of mine) {
    assert.ok(!round(r.body), `«${r.sel}» is round`);
    assert.ok(r.sel.split(',').every((x) => x.trim().startsWith('html.fxl ')), `«${r.sel}» is not keyed to html.fxl (it would outlive dispose())`);
    assert.ok(!/transition|animation|will-change|filter|box-shadow|text-shadow/.test(r.body), `«${r.sel}» has a transition, an animation or an effect of its own`);
  }
  const sized = (b: string) => { const m = /(?:^|;)font(?:-size)?\s*:[^;]*?(\d+(?:\.\d+)?)px/.exec(b); return m ? parseFloat(m[1]!) : null; };
  const BOTH = 'html.fxl .ssu::before,html.fxl .ssu[data-t2]::after';
  const chips = mine.find((r) => r.sel === BOTH && /height:24px/.test(r.body)), narrow = mine.find((r) => r.sel === BOTH && r !== chips);
  const first = mine.find((r) => r.sel === 'html.fxl .ssu::before'), second = mine.find((r) => r.sel === 'html.fxl .ssu[data-t2]::after'), yes = mine.find((r) => r.sel === 'html.fxl .ssu.y::before,html.fxl .ssu.y[data-t2]::after');
  assert.ok(chips && sized(chips.body) === 12 && /height:24px/.test(chips.body) && /white-space:nowrap/.test(chips.body) && /box-sizing:border-box/.test(chips.body) && /border:1px solid var\(--hair\)/.test(chips.body), 'a chip: 12px mono, 24px tall including its hairline border (a pseudo-element does not get the page\'s border-box reset), never wrapping');
  assert.ok(narrow && sized(narrow.body) === 10 && /padding:0 \.35em/.test(narrow.body), 'on a phone: 10px, padded tighter');
  assert.ok(css.includes('@media (max-width:480px){' + BOTH + '{'), 'at 480px and under');
  assert.ok(first && first.body === 'content:attr(data-t1)' && second && second.body === 'content:attr(data-t2)', 'the text of a chip is read from its unit\'s own data attributes, nothing is typed in the stylesheet, and a second chip exists only on a unit that has one');
  assert.deepEqual(mine.flatMap((r) => [...r.body.matchAll(/content\s*:\s*([^;]+)/g)].map((m) => m[1]!.trim())), ['attr(data-t1)', 'attr(data-t2)'], 'no other generated content');
  assert.ok(yes && /border-color:var\(--ac\)/.test(yes.body), 'the yes list\'s chips are outlined in the accent');
  for (const r of mine) { const z = sized(r.body); if (z !== null) assert.ok(z >= 10, `«${r.sel}» sets its text at ${z}px`); }
  const layer = mine.find((r) => /\.ssv$/.test(r.sel)), unit = mine.find((r) => r.sel === 'html.fxl .ssu');
  assert.ok(layer && /position:absolute/.test(layer.body) && /width:0/.test(layer.body) && /height:0/.test(layer.body) && /pointer-events:none/.test(layer.body), 'the layer is a point at the corner of its box, and never takes a click');
  assert.ok(unit && /position:absolute/.test(unit.body) && /display:flex/.test(unit.body) && /gap:3px/.test(unit.body), 'a unit is its chips side by side, 3px apart');
  const stray = (t: string) => [...t.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((x) => x.trim())).filter((x) => NAMES.test(x));
  const FIRST = 'html.fxl .ssu::before', SECOND = 'html.fxl .ssu[data-t2]::after';
  assert.deepEqual(stray(css), ['html.fxl .ssv', 'html.fxl .ssu', FIRST, SECOND, FIRST, SECOND, 'html.fxl .ssu.y::before', 'html.fxl .ssu.y[data-t2]::after', FIRST, SECOND], 'no other rule of the stylesheet styles an `ssv`, `ssu` or `sst`');
  const page = readFileSync(new URL('../src/pages/v3.astro', import.meta.url), 'utf8');
  assert.ok(!/class="[^"]*\b(?:ssv|ssu|sst)\b/.test(page), 'and the page uses none of the classes: they are the effect\'s');
  assert.ok(!/html\.fxl \.para\s*\{|html\.fxl #c13\s*\{|html\.fxl \.pcol/.test(css), 'the lists are not positioned or restyled by the stylesheet (the effect measures the corner of the layer, wherever the page puts it)');
  // the rule can fail
  assert.deepEqual(stray('.sst{padding:8px}.x .ssv{y:1}.foo{z:1}.sstx{a:1}'), ['.sst', '.x .ssv']);
  assert.ok(round('border-radius:50%;width:1px') && round('clip-path:circle(50%)') && !round('border:1px solid red'));
});

test('chapter 13: the effect writes only transform and opacity, adds no element but its units and their layer (the chips are pseudo-elements), writes no copy but a token\'s own text into a data attribute, plays once on c13-data\'s clocks, gives the lists back whole when anything fails, and is registered', () => {
  const src = readFileSync(new URL('../src/aegis/fx/c13.ts', import.meta.url), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/\.style\.(?!opacity\b|transform\b)\w+\s*=(?!=)/.test(code), 'it sets only style.opacity and style.transform');
  assert.ok(!/setProperty\(/.test(code), 'it sets no custom property');
  assert.deepEqual([...new Set([...code.matchAll(/style\.removeProperty\('([^']+)'\)/g)].map((m) => m[1]))], ['opacity'], 'what it gives back is the lines\' opacity');
  assert.deepEqual([...code.matchAll(/\.textContent\s*=\s*([^;]+);/g)].map((m) => m[1]), [], 'it writes no text node');
  assert.deepEqual([...code.matchAll(/setAttribute\(([^,]+), ([^)]+)\)/g)].map((m) => `${m[1]}=${m[2]}`), ["'aria-hidden'='true'", '`data-t${i + 1}`=t'], 'the only attributes it sets: the layer is aria-hidden, and the text of a chip is a token piece read from the page\'s own token file');
  assert.ok(/piecesOf\(map, t\)/.test(code) && /pieces\.slice\(u\.first, u\.last \+ 1\)\.map\(\(p\) => show\(p\[0\]\)\)/.test(code) && /tokensFromPage\(\)/.test(code) && /unitsOf\(pieces\)/.test(code), 'the chips are the real pieces, a leading space shown as «·» by show(), grouped by c13-data\'s unitsOf');
  assert.ok(/\bus = unitsOf\(pieces\);/.test(code) && /chips: us\.map\(/.test(code) && /ranges: us\.map\(/.test(code), 'every unit of a line is kept (none cut off, none sampled): the chips and the ranges are made from all of the line\'s units');
  assert.deepEqual([...code.matchAll(/\bel\('([a-z]+)', ([^)]+)\)/g)].map((m) => `${m[1]}.${m[2]!.replace(/\$\{[^}]*\}/g, '$')}`), ["div.'fxk ssv'", 'div.`fxk ssu $`'], 'the elements it adds: its layer and its units, marked fxk, and nothing inside a unit (the contract\'s counter finds every descendant of what is added)');
  assert.ok(/layer\.setAttribute\('aria-hidden', 'true'\)/.test(code), 'and the layer is a decoration (aria-hidden)');
  assert.ok(/import \{[^}]*\bCAP\b[^}]*\} from '\.\.\/c13-data'/.test(src) && /need\(lines\.every\(\(l\) => l\.chips\.every\(\(c\) => c\.length >= 1 && c\.length <= CAP\)\)/.test(code), 'it refuses a unit with no chip or with more than the pseudo-elements it has');
  assert.ok(!/innerHTML|innerText|insertAdjacent|\.prepend\(|cloneNode|replaceWith|createElement|createTextNode/.test(code), 'it moves no node and writes no markup');
  assert.ok(!/canvas|drawImage|fetch\(|\.webp|\.gif|\.apng/i.test(code), 'no footage, no sprite, no animated image');
  assert.ok(/import \{[^}]*\bplan\b[^}]*\} from '\.\.\/c13-data'/.test(src) && /duration: P!\.end\b/.test(code) && /x: P!\.end\b/.test(code), 'it plays for the end of c13-data\'s plan');
  assert.ok(/nodeCount\(specs\.length, lines\.length\) <= NODE_BUDGET/.test(code), 'it refuses more nodes than the contract allows');
  assert.ok(/once\(para, undo/.test(code) && /REG\['c13:sort'\]/.test(code) && /margin:/.test(code), 'a play-once effect that asks once(), and shows itself to the review hooks');
  assert.ok(/CHAPTERS[^\n]*\['c13', initC13\]/.test(readFileSync(new URL('../src/aegis/fx/index.ts', import.meta.url), 'utf8')), 'the effect is registered in the list of chapters');
  assert.ok(/arm: \(\) => \{ para\.dataset\.fxS = 'arm'; lines\.forEach\(\(l\) => \{ l\.li\.style\.opacity = '0'; \}\); \}/.test(code), 'waiting, only the seven lines are transparent');
  assert.ok(/catch \(e\) \{ off\(e\); \}/.test(code) && /const off = \(e: unknown\) => \{ console\.warn\([^;]*; done\(\); \}/.test(code), 'a failure is a warning and the lists given back whole');
  assert.ok(/onWidth\(\(\) => \{ if \(o\.state\(\) === 'run'\) o\.clear\(\); \}\)/.test(code), 'a width change gives back a sorting that is playing');
  assert.ok(/layer && layer\.remove\(\)/.test(code) && /onComplete: done/.test(code), 'the chips and the layer go in the very task it is done');
  assert.ok(/pileOf\(specs\.length\)\.order\.forEach\(\(k\) => layer!\.appendChild\(boxes\[k\]!\)\)/.test(code), 'the units are stacked in the pile\'s own order');
  assert.ok(/Y\.right <= N\.left \+ 1 && Math\.abs\(Y\.top - N\.top\) < 2/.test(code) && /Math\.min\(B\.top \+ B\.height \/ 2, innerHeight \* 0\.72\)/.test(code), 'the pile is on the border between the columns, or in the middle of a stacked block, and always in view');
  assert.ok(/createRange\(\)/.test(code) && /getClientRects\(\)/.test(code), 'each unit\'s place is where its words are (a Range over them)');
});
