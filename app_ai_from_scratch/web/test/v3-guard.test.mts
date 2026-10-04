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
import { glowAlpha, squareFrame, squareGlow, toward } from '../src/aegis/util.ts';
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

test('chapter 04: the arcs are one draw call in the order they were made, and row A\'s padding never jumps by 3 px or more between two rendered frames', () => {
  const llm = readFileSync(new URL('../src/aegis/llm.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), core = readFileSync(new URL('../src/aegis/core.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  // the arcs: one LineSegments, one index buffer, an alpha per vertex (0 while an arc is hidden), none of the old per-arc Line objects or materials
  assert.ok(/new THREE\.LineSegments\(arcGeo, arcMat\)/.test(llm) && /setIndex\(new THREE\.BufferAttribute\(arcIdx, 1\)\)/.test(llm), 'the 45 curves are one LineSegments with an index buffer');
  assert.ok(!/new THREE\.Line\(/.test(llm) && !/a\.line\b/.test(llm) && !/\.line\.material/.test(llm), 'no per-arc Line object or material is left');
  assert.ok(/arcAlpha\.fill\(shown \? Math\.min\(1, o\) : 0, a\.base, a\.base \+ AS \+ 1\)/.test(llm), 'an arc that is not drawn has alpha exactly 0');
  assert.ok(/flat varying float vA/.test(llm), 'the alpha is flat: the arc\'s own opacity to the last bit, not an interpolation of it');
  // the padding: written from a value that follows its target by at most PAD_STEP per rendered frame (A.st.f counts the real ticker's frames; a forced tick for a review jump is not one)
  assert.ok(/c\.style\.setProperty\('--pad', padA\.toFixed\(1\) \+ 'px'\)/.test(llm) && /padA = toward\(padA, padT, PAD_STEP\)/.test(llm) && /A\.st\.f !== padFrame/.test(llm), 'row A reads padA, which moves once per rendered frame');
  const PAD_STEP = Number(/const PAD_STEP = ([0-9.]+);/.exec(llm)?.[1]);
  assert.ok(PAD_STEP > 0 && PAD_STEP < 3, `PAD_STEP is under the 3 px a layout shift needs (${PAD_STEP})`);
  assert.equal((core.match(/A\.st\.f\+\+/g) ?? []).length, 2, 'the two ticker callbacks (smooth scroll and reduced motion) count rendered frames, and nothing else does');
  // the follower itself: never past its target, never more than a step, and it gets there
  for (const [cur, tgt] of [[0, 9], [9, 0], [4.5, 4.5], [0, 1], [8.9, 9], [3, -3]]) {
    let c = cur, n = 0; while (c !== tgt && n < 100) { const nx = toward(c, tgt, PAD_STEP); assert.ok(Math.abs(nx - c) <= PAD_STEP + 1e-9, 'a step is at most PAD_STEP'); assert.ok((nx - tgt) * (c - tgt) >= 0, 'never past the target'); c = nx; n++; }
    assert.equal(c, tgt, `${cur} -> ${tgt} arrives`); assert.ok(n <= Math.ceil(Math.abs(cur - tgt) / PAD_STEP) + 1);
  }
  assert.equal(toward(0, 9, 2.4), 2.4); assert.equal(toward(9, 0, 2.4), 6.6);
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

