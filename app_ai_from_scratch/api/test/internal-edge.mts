import assert from 'node:assert/strict';
import { createServer } from 'node:http';

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

const blocked = await fetch(`${API}/api/internal/entitlements`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-ray': 'test-ray', authorization: `Bearer ${process.env.PAYMENTS_SECRET}` },
  body: JSON.stringify({}),
});
assert.equal(blocked.status, 404);

const unauthorized = await fetch(`${API}/api/internal/entitlements`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
  body: JSON.stringify({}),
});
assert.equal(unauthorized.status, 401);
// The test peer is 127.0.0.1, inside the default allowlist, so everything below
// that is NOT refused reaches the bearer check. What is refused here is refused
// because of cf-ray alone (the deny signal for traffic web proxies in), and it
// must be refused however the path is spelled.
const post = (path: string, headers: Record<string, string> = {}) => fetch(`${API}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.PAYMENTS_SECRET}`, ...headers },
  body: JSON.stringify({}),
});

// Before LED-3059 this reached the handler: the regex saw `%69nternal`, Fastify
// routed it to `internal`. Without cf-ray it proves the encoded spelling IS routed;
// with cf-ray it must now be refused.
const encodedReachesHandler = await post('/api/%69nternal/entitlements');
assert.notEqual(encodedReachesHandler.status, 404, 'precondition: Fastify routes the encoded spelling to the handler');
for (const path of [
  '/api/%69nternal/entitlements',
  '/api/v3/%69nterno/catalogo',
  '/api/v3/interno/herramienta',
  '/api/interno/bus/claim',
  '/api/INTERNAL/entitlements',
]) {
  const r = await post(path, { 'cf-ray': 'test-ray' });
  assert.equal(r.status, 404, `${path} with cf-ray`);
}

// A non-internal path is untouched, cf-ray or not.
const version = await fetch(`${API}/api/version`, { headers: { 'cf-ray': 'test-ray' } });
assert.equal(version.status, 200);

// Malformed escapes never reach a handler: Fastify answers 400 on its own.
const malformed = await post('/api/internal/%zz');
assert.equal(malformed.status, 400);

console.log('internal-edge: cf-ray 404 (plain, encoded, versioned); bad bearer 401; private peer reaches the bearer check; /api/version 200; malformed 400');
process.exit(0);
