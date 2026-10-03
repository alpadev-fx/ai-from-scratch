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
