// AI-36: the welcome mail on successful registration. Nothing sent it before
// this existed, so the contract to protect is narrow but firm:
//
//  - it goes out, bilingually, once the account is committed;
//  - a mailer that THROWS must never turn a successful signup into a 500;
//  - an UNCONFIGURED mailer (undefined -- see mail.ts) must not either, and
//    that miss must not be silent (auth/src/index.ts logs it).
//
// Same shape as registration.mts and auth-boundary.mts: real /data, a fake
// log, and the actual route handler pulled out of registerRoutes(). The only
// double here is the mailer, per AI-36's instruction to test with an injected
// mailer double instead of hitting the real Resend network.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../../auth/src/index.ts';
import { run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';

interface MailCall { to: string; subject: string; text: string }
type Mailer = { send(input: MailCall): Promise<void> };

const log = { info: () => {}, warn: () => {}, error: () => {} };

function registerHandler(mailer?: Mailer) {
  const auth = createAuth({ one, many, write, writeAuthorized,
    origin: 'http://localhost', production: false, log, mailer });
  const routes = new Map<string, (req: unknown, reply: unknown) => Promise<unknown>>();
  auth.registerRoutes({
    post(path: string, fn: (req: unknown, reply: unknown) => Promise<unknown>) { routes.set(path, fn); },
    get() {},
    patch() {},
  });
  const register = routes.get('/api/auth/register');
  assert.ok(register, 'auth.registerRoutes must register POST /api/auth/register');
  return register!;
}

const reply = () => {
  const r: { status?: number; body?: unknown; code: (n: number) => unknown; send: (v: unknown) => unknown; setCookie: () => void } = {
    setCookie() {},
    code(n) { r.status = n; return r; },
    send(v) { r.body = v; return v; },
  };
  return r;
};

const body = (email: string, extra: Record<string, unknown> = {}) => ({
  email, name: 'Bienvenida', password: 'SafePass12', acepta: true, ...extra,
});

const emails: string[] = [];
const newEmail = (tag: string): string => {
  const address = `welcome-${tag}-${randomUUID()}@example.test`;
  emails.push(address);
  return address;
};

try {
  // 1. Sent on success, in Spanish by default and in English on request --
  //    the same lang === 'en' ? ... : 'es' convention as lesson-meta.ts,
  //    assess.ts and grading.ts, never a third copy of the content.
  {
    const calls: MailCall[] = [];
    const mailer: Mailer = { async send(input) { calls.push(input); } };
    const register = registerHandler(mailer);

    const emailEs = newEmail('es');
    const okEs = reply();
    await register({ body: body(emailEs) }, okEs);
    assert.equal(okEs.status, 201);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.to, emailEs);
    assert.equal(calls[0]!.subject, 'Bienvenida a IA desde cero');
    assert.ok(calls[0]!.text.includes('http://localhost/login'), 'must say how to get in');
    assert.ok(calls[0]!.text.includes('14 días'), 'must state the 14-day guarantee');
    assert.ok(!/te avisamos.*antes del.*cobro/i.test(calls[0]!.text),
      'must never promise an email before a charge -- the platform cannot keep it');

    const emailEn = newEmail('en');
    const okEn = reply();
    await register({ body: body(emailEn, { lang: 'en' }) }, okEn);
    assert.equal(okEn.status, 201);
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.to, emailEn);
    assert.equal(calls[1]!.subject, 'Welcome to IA desde cero');
    assert.ok(calls[1]!.text.includes('http://localhost/login'), 'must say how to get in');
    assert.ok(calls[1]!.text.includes('14-day guarantee'), 'must state the 14-day guarantee');
  }

  // 2. A throwing mailer must never fail the signup: the account is already
  //    committed by the time mail is attempted.
  {
    const mailer: Mailer = { async send() { throw new Error('resend is down'); } };
    const register = registerHandler(mailer);
    const email = newEmail('throws');
    const ok = reply();
    await register({ body: body(email) }, ok);
    assert.equal(ok.status, 201, 'signup must succeed even when the mailer throws');
    assert.equal((ok.body as { user?: { email?: string } }).user?.email, email);
  }

  // 3. No mail provider configured (mailer undefined, see mail.ts's
  //    loadMailer) must not fail signup either -- fail-closed here means
  //    "skip and log", not "signup fails".
  {
    const register = registerHandler(undefined);
    const email = newEmail('unconfigured');
    const ok = reply();
    await register({ body: body(email) }, ok);
    assert.equal(ok.status, 201, 'signup must succeed when no mail provider is configured');
  }

  console.log('welcome-mail: sent bilingually on success; a throwing or unconfigured mailer never fails registration');
} finally {
  for (const address of emails) await run('DELETE FROM users WHERE email = ?', [address]);
  await pool.end();
}
