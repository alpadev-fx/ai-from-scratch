import test from 'node:test';
import assert from 'node:assert/strict';
import { guard, guarded, violations, withoutCity } from '../src/aegis/copy-guard.ts';
import { STR } from '../src/lib/i18n.ts';
import { PRECIO_VISUAL } from '../src/lib/price.ts';
import { ctxChips, ctxOf, draw, softmax, tokenize } from '../src/aegis/specimens.ts';
import { candidatos, modulos } from '../src/data/landing.ts';

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

test('the candidate context is not the Cartagena sentence, and the sentence still tokenizes to the five chips of row A', () => {
  for (const lang of ['es', 'en'] as const) {
    const P = STR[lang].pub.land, c = ctxOf(P.bD);
    assert.notEqual(c, P.aEjemplo);
    assert.ok(!c.includes('Cartagena') && !P.aEjemplo.includes(c));
    assert.equal(tokenize(P.aEjemplo).length, 5);                       // llm.ts and v3.astro both assume row A has 5 chips
    assert.ok(c.split(/\s+/).filter(Boolean).length >= 3);              // the context row needs words to carry attention
  }
  assert.deepEqual(tokenize(STR.es.pub.land.aEjemplo), ['Carta', 'gena', 'es', 'hermo', 'sa']);
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

// Lesson 05 («No ve palabras ni letras: ve trozos») cuts «Cartagena es hermosa» into Carta | gena | es | hermo | sa. The dog
// context that follows is the same kind of input, so it is cut by the SAME tokenizer, never by spaces.
test('the context row is the specimen tokenizer\'s output, and regroups into the sentence', () => {
  for (const lang of ['es', 'en'] as const) {
    const c = ctxOf(STR[lang].pub.land.bD), chips = ctxChips(c);
    assert.deepEqual(chips.map((x) => x.t), tokenize(c));                              // exactly what the interactive tokenizer prints
    const words: string[] = []; chips.forEach((x) => { words[x.w] = (words[x.w] ?? '') + x.t; });
    assert.equal(words.join(' '), c.replace(/\s+/g, ' ').trim());                      // pieces of a word joined, words with one space
    assert.deepEqual([...new Set(chips.map((x) => x.w))], words.map((_, i) => i));      // word indexes run 0..n-1 with no gap
  }
  // pinned on purpose: a change to the tokenizer must be a conscious decision for this page
  assert.deepEqual(tokenize(ctxOf(STR.es.pub.land.bD)), ['Le', 'pedis', 'te', 'un', 'nombr', 'e', 'para', 'tu', 'perro', '.']);
  assert.deepEqual(tokenize(ctxOf(STR.en.pub.land.bD)), ['You', 'asked', 'it', 'to', 'name', 'your', 'dog.']);   // EN words are all <= 5 chars: one piece each
  const es = ctxOf(STR.es.pub.land.bD);
  assert.ok(ctxChips(es).length > es.split(/\s+/).length);                             // the ES context shows words broken into pieces
});

test('ctxChips groups pieces by word and follows tokenize at the edges', () => {
  assert.deepEqual(ctxChips(''), []);
  assert.deepEqual(ctxChips('Hola mundo'), [{ t: 'Hola', w: 0 }, { t: 'mundo', w: 1 }]);
  assert.deepEqual(ctxChips('abcdefghij k'), [{ t: 'abcde', w: 0 }, { t: 'fghi', w: 0 }, { t: 'j', w: 0 }, { t: 'k', w: 1 }]);
  assert.equal(ctxChips('x '.repeat(40)).length, tokenize('x '.repeat(40)).length);        // the same 26-piece cap
});
