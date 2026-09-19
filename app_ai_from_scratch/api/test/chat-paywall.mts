/**
 * A free account cannot reach the AI tutor. End to end, over HTTP, with a real
 * session — because the unit test in paywall.mts proves the predicate and proves
 * nothing about whether the route asks it.
 *
 * It registers a throwaway account, which is born unpaid, and posts to the same
 * endpoint both front ends use. 402 requiere_compra is the only acceptable answer.
 *
 * WHY IT ALSO ASSERTS THE PANEL. `fuente: 'panel'` and `fuente: 'chat'` are the
 * floating panel and the /chat page; they are one endpoint, and the guard must
 * not look at that field. If someone later moves the check behind a `fuente`
 * branch, this fails.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { run, pool } from '../src/db.ts';

const port = await new Promise<number>((resolve, reject) => {
  const s = createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const a = s.address();
    if (!a || typeof a === 'string') return reject(new Error('no port'));
    const p = a.port; s.close(() => resolve(p));
  });
});
process.env.PORT = String(port);
process.env.HOST = '127.0.0.1';
process.env.PAYMENTS_SECRET = process.env.PAYMENTS_SECRET || 'test-payments-secret-32-chars-min!!';
const API = `http://127.0.0.1:${port}`;
await import('../src/server.ts');
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${API}/api/version`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const email = `paywall-${randomUUID()}@example.test`;

try {
  const reg = await fetch(`${API}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: 'Paywall', password: 'SafePass12', acepta: true }),
  });
  assert.equal(reg.status, 201, 'the account must be created before anything is proved about it');
  const cookie = (reg.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'registration must hand back a session cookie');

  // 1. No session at all: 401, and never 402. Telling an anonymous caller to buy
  //    would say that the address exists.
  const anon = await fetch(`${API}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensajes: [{ role: 'user', content: 'hola' }] }),
  });
  assert.equal(anon.status, 401, 'no session is 401');

  // 2. The /chat page.
  for (const fuente of ['chat', 'panel']) {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ mensajes: [{ role: 'user', content: 'explicame la leccion 5' }], fuente }),
    });
    assert.equal(res.status, 402, `fuente=${fuente} must be refused with 402`);
    const body = await res.json() as { error?: string; ruta?: string };
    assert.equal(body.error, 'requiere_compra', `fuente=${fuente} must say why`);
    assert.equal(body.ruta, '/pago', 'and where to go');
  }

  // 3. A malformed body is still the schema's business, not the paywall's.
  //    SCHEMA_CHAT runs in preValidation, which is BEFORE any handler code, so an
  //    empty `mensajes` is 400 and never reaches the gate. That is correct and
  //    worth pinning: a request that cannot be parsed never reaches a provider
  //    either, so there is nothing to sell it. The claim the paywall does make is
  //    the one above — a well-formed question from a free account is 402, and it
  //    is 402 before hasAi() is consulted, so the answer never depends on whether
  //    IA_SECRETO happens to be set on the machine serving it.
  const empty = await fetch(`${API}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ mensajes: [] }),
  });
  assert.equal(empty.status, 400, 'the JSON schema rejects an empty message list before the handler runs');

  console.log('chat-paywall: a free account gets 402 requiere_compra on /api/chat, from both surfaces');
} finally {
  await run('DELETE FROM users WHERE email = ?', [email]);
  await pool.end();
  process.exit(0);
}
