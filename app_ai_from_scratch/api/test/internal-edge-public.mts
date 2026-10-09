import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// LED-3059, the case the cf-ray guard never covered: a request that reaches api
// WITHOUT going through Cloudflare (the public *.up.railway.app hostname) and so
// carries no cf-ray. The test peer is 127.0.0.1; the allowlist below leaves it
// out, which makes this process see its own client the way api sees the public
// edge: a TCP peer outside the private network.
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
process.env.INTERNAL_ALLOWED_CIDRS = '10.255.0.0/16';
const API = `http://127.0.0.1:${port}`;
await import('../src/server.ts');
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${API}/api/version`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const bearer = `Bearer ${process.env.PAYMENTS_SECRET}`;
const call = (method: string, path: string, headers: Record<string, string> = {}) => fetch(`${API}${path}`, {
  method,
  headers: { 'content-type': 'application/json', authorization: bearer, ...headers },
  body: method === 'GET' ? undefined : JSON.stringify({}),
});

// No cf-ray, VALID bearer: before the fix this reached the handler. Now the peer
// alone decides, and the peer is outside the allowlist.
for (const [method, path] of [
  ['POST', '/api/internal/entitlements'],
  ['GET', '/api/interno/catalogo'],
  ['POST', '/api/interno/herramienta'],
  ['POST', '/api/interno/bus/claim'],
  ['POST', '/api/v3/interno/herramienta'],
  ['POST', '/api/%69nternal/entitlements'],
  ['POST', '/api/v3/%69nterno/herramienta'],
  ['POST', '/api/%2569nternal/entitlements'],
] as const) {
  const r = await call(method, path);
  assert.equal(r.status, 404, `${method} ${path}`);
  assert.deepEqual(await r.json(), { error: 'not_found' }, `${method} ${path} body`);
}

// Every header a client can write is irrelevant to the decision: claiming to be
// private, to be behind a proxy, or to be the internal host changes nothing.
for (const spoof of [
  { 'x-forwarded-for': '10.255.0.7' },
  { 'x-real-ip': '10.255.0.7' },
  { 'cf-connecting-ip': '10.255.0.7' },
  { forwarded: 'for=10.255.0.7' },
  { 'x-forwarded-host': 'api.railway.internal' },
  { 'x-forwarded-proto': 'http' },
]) {
  const r = await call('POST', '/api/internal/entitlements', spoof);
  assert.equal(r.status, 404, JSON.stringify(spoof));
}

// Everything else is untouched: public routes still answer, including with the
// same headers.
assert.equal((await fetch(`${API}/api/version`)).status, 200);
assert.equal((await fetch(`${API}/api/version`, { headers: { 'x-forwarded-for': '10.255.0.7' } })).status, 200);

console.log('internal-edge-public: peer outside the allowlist gets 404 on every spelling of /api/internal and /api/interno, spoofed headers included; public routes unaffected');
process.exit(0);
