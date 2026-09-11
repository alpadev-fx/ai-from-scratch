import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { COOKIE, sign } from '../../auth/src/core.ts';
import { createAuth } from '../../auth/src/index.ts';
import { get, run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';

const log = { info: () => {}, warn: () => {}, error: () => {} };
const auth = createAuth({ one, many, write, writeAuthorized,
  origin: 'http://localhost', production: false, log });

const email = `revoke-${randomUUID()}@example.test`;
const user = await get<{ id: number; token_version: number }>(
  `INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
   VALUES (?,?,?,'student',0,'auto','auto') RETURNING id,token_version`,
  [email, 'Revoke', 'test-only-not-a-password-hash']);
assert.ok(user);

const routes = new Map<string, (req: unknown, reply: unknown) => Promise<unknown>>();
const app = {
  post(path: string, fn: (req: unknown, reply: unknown) => Promise<unknown>) { routes.set(path, fn); },
  get() {},
  patch() {},
};
auth.registerRoutes(app);

const reply = () => {
  const r: { status?: number; body?: unknown; clearCookie: () => void; code: (n: number) => unknown; send: (v: unknown) => unknown; setCookie: () => void } = {
    clearCookie() {}, setCookie() {},
    code(n) { r.status = n; return r; },
    send(v) { r.body = v; return v; },
  };
  return r;
};

try {
  const tokenA = sign({ sub: user.id, role: 'student', v: user.token_version });
  const tokenB = sign({ sub: user.id, role: 'student', v: user.token_version });
  const logout = routes.get('/api/auth/logout');
  assert.ok(logout);

  const plain = reply();
  await logout({ body: {}, cookies: { [COOKIE]: tokenA } }, plain);
  const afterPlain = await get<{ token_version: number }>('SELECT token_version FROM users WHERE id = ?', [user.id]);
  assert.equal(afterPlain?.token_version, user.token_version, 'plain logout must not bump token_version');

  const everywhere = reply();
  await logout({ body: { todos: true }, cookies: { [COOKIE]: tokenB } }, everywhere);
  const after = await get<{ token_version: number }>('SELECT token_version FROM users WHERE id = ?', [user.id]);
  assert.equal(after?.token_version, user.token_version + 1);

  const still = await auth.currentUser({ cookies: { [COOKIE]: tokenB } });
  assert.equal(still, null, 'old token_version must fail after revoke');
  console.log('session-revocation: todos:true bumps token_version; plain logout does not');
} finally {
  await run('DELETE FROM users WHERE id = ?', [user.id]);
  await pool.end();
}
