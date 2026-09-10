import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { POLICY_VERSION } from '../../auth/src/core.ts';
import { createAuth } from '../../auth/src/index.ts';
import { get, run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';

const log = { info: () => {}, warn: () => {}, error: () => {} };
const auth = createAuth({ one, many, write, writeAuthorized,
  origin: 'http://localhost', production: false, log });

const routes = new Map<string, (req: unknown, reply: unknown) => Promise<unknown>>();
auth.registerRoutes({
  post(path: string, fn: (req: unknown, reply: unknown) => Promise<unknown>) { routes.set(path, fn); },
  get() {},
  patch() {},
});
const register = routes.get('/api/auth/register');
assert.ok(register);

const reply = () => {
  const r: { status?: number; body?: unknown; code: (n: number) => unknown; send: (v: unknown) => unknown; setCookie: () => void } = {
    setCookie() {},
    code(n) { r.status = n; return r; },
    send(v) { r.body = v; return v; },
  };
  return r;
};

const email = `consent-${randomUUID()}@example.test`;
const before = Number((await get<{ c: string }>('SELECT COUNT(*)::text AS c FROM users'))?.c ?? 0);

try {
  const denied = reply();
  await register({ body: { email, name: 'Consent', password: 'SafePass12' } }, denied);
  assert.equal(denied.status, 400);
  assert.deepEqual(denied.body, { error: 'falta_consentimiento' });
  const mid = Number((await get<{ c: string }>('SELECT COUNT(*)::text AS c FROM users'))?.c ?? 0);
  assert.equal(mid, before);

  const ok = reply();
  await register({ body: { email, name: 'Consent', password: 'SafePass12', acepta: true } }, ok);
  assert.equal(ok.status, 201);
  const row = await get<{ consent_at: string; consent_version: string }>(
    'SELECT consent_at::text, consent_version FROM users WHERE email = ?', [email]);
  assert.ok(row?.consent_at);
  assert.equal(row?.consent_version, POLICY_VERSION);
  console.log('registration: acepta required; consent columns stored');
} finally {
  await run('DELETE FROM users WHERE email = ?', [email]);
  await pool.end();
}
