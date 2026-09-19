// The transactional mail catalogue. Pure: no Postgres, no network, no Resend.
//
// What this protects, and why each one is here:
//
//  - EVERY kind renders in BOTH languages. The catalogue used to be Spanish
//    only while the platform ships bilingual copy everywhere else, so an
//    English-speaking student got a Spanish receipt. `SPECS` is now
//    Record<Lang, Record<EmailKind, Spec>>, and this test is what stops a new
//    kind from landing half-translated.
//  - No `{{nombre}}` survives rendering, in HTML or in text. A leaked
//    placeholder is what a mail merge bug looks like from the inbox.
//  - The name is escaped in the HTML body. It is user-controlled input that
//    goes into a document other people open.
//  - The text part carries the action URL and the fields. Plenty of clients
//    still render text/plain, and a receipt whose total exists only in the
//    HTML part is a receipt some buyers cannot read.
import assert from 'node:assert/strict';
import { SPECS, mailLang, renderEmailHtml } from '../../design/saas-emails/templates.ts';
import type { EmailKind, Lang } from '../../design/saas-emails/templates.ts';

const LANGS: Lang[] = ['es', 'en'];
const KINDS = Object.keys(SPECS.es) as EmailKind[];

assert.equal(KINDS.length, 20, 'the catalogue is 20 kinds; update this test deliberately, not by accident');
assert.deepEqual(Object.keys(SPECS.en).sort(), KINDS.slice().sort(),
  'every kind must exist in both languages');

for (const kind of KINDS) {
  for (const lang of LANGS) {
    const out = renderEmailHtml({ kind, lang, name: 'Ana', actionUrl: 'https://example.test/x',
      fields: [{ label: 'Total', value: '19.995 COP' }] });
    assert.ok(out.subject.length > 0, `${kind}/${lang}: empty subject`);
    assert.ok(!out.html.includes('{{nombre}}'), `${kind}/${lang}: placeholder left in the HTML`);
    assert.ok(!out.text.includes('{{nombre}}'), `${kind}/${lang}: placeholder left in the text`);
    assert.ok(out.html.includes('Ana'), `${kind}/${lang}: the name never reached the body`);
    assert.ok(out.html.includes(`<html lang="${lang}"`), `${kind}/${lang}: wrong lang attribute`);
    assert.ok(out.text.includes('Total: 19.995 COP'), `${kind}/${lang}: fields missing from the text part`);
    assert.ok(out.text.includes('https://example.test/x'), `${kind}/${lang}: action URL missing from the text part`);
  }
}

// Spanish and English must actually differ somewhere for every kind. A copied
// Spanish spec under `en` would pass every check above.
for (const kind of KINDS) {
  const es = SPECS.es[kind], en = SPECS.en[kind];
  assert.notDeepEqual([es.title, es.paragraphs, es.footer], [en.title, en.paragraphs, en.footer],
    `${kind}: the English spec is a copy of the Spanish one`);
}

// The name is user input. It must be escaped in the HTML and left alone in text.
{
  const out = renderEmailHtml({ kind: 'welcome', lang: 'es', name: '<script>alert(1)</script>' });
  assert.ok(!out.html.includes('<script>'), 'the name was interpolated into the HTML unescaped');
  assert.ok(out.html.includes('&lt;script&gt;'), 'the name must survive, escaped');
}

// The welcome copy is the account mail: it must say how to get in and state the
// guarantee, and must never promise a heads-up before a charge -- no job in
// this codebase sends one.
for (const lang of LANGS) {
  const out = renderEmailHtml({ kind: 'welcome', lang, name: 'Ana', actionUrl: 'http://localhost/login' });
  assert.ok(out.text.includes('http://localhost/login'), `welcome/${lang}: must say how to get in`);
  assert.ok(out.text.includes(lang === 'en' ? '14-day guarantee' : '14 días'),
    `welcome/${lang}: must state the guarantee`);
  assert.ok(!/te avisamos.*antes del.*cobro/i.test(out.text),
    `welcome/${lang}: must never promise an email before a charge`);
}

// mailLang is the only place that decides which language a user gets. Spanish
// is the product fallback everywhere server-side; English is an explicit opt-in.
assert.equal(mailLang('en'), 'en');
assert.equal(mailLang('es'), 'es');
assert.equal(mailLang('auto'), 'es');
assert.equal(mailLang('fr'), 'es');
assert.equal(mailLang(undefined), 'es');

console.log(`email-templates: ${KINDS.length} kinds render in es and en, escaped, with no placeholder left behind`);
