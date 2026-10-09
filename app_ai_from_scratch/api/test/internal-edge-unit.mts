import assert from 'node:assert/strict';
import { isInternalPath, privatePeerChecker } from '../src/internal-edge.ts';

// ---- classification: decoded, to a fixpoint ----
for (const yes of [
  '/api/internal/entitlements',
  '/api/interno/catalogo',
  '/api/interno/herramienta?x=1',
  '/api/v3/interno/bus/claim',
  '/api/v2/internal/entitlements',
  '/api/internal',
  '/api/INTERNAL/entitlements',
  '/api/%69nternal/entitlements', // Fastify routes this to the internal handler
  '/api/v3/%69nterno/catalogo',
  '/api/%2569nternal/entitlements', // double encoding
  '/api/%252569nternal/entitlements',
  '/api/internal%2Fentitlements',
]) assert.equal(isInternalPath(yes), true, yes);

for (const no of [
  '/api/version',
  '/api/lessons/1',
  '/api/v3/labs/1.1/attempt',
  '/api/internals', // a different segment, not the internal prefix
  '/api/x/internal/y',
  '/api/auth/login?next=/api/internal/x', // the query is not the path
  '/api/lessons/%zz', // malformed escape: Fastify answers 400 before any handler
]) assert.equal(isInternalPath(no), false, no);

// a path that is still changing after four decode rounds is refused
assert.equal(isInternalPath('/api/%25252525252569nternal/x'), true);

// ---- peer allowlist: defaults ----
const ok = privatePeerChecker(undefined);
for (const yes of ['127.0.0.1', '::1', '10.0.0.5', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1', 'fd12::1', 'fc00::1', '::ffff:10.0.0.5', '::ffff:127.0.0.1', 'fd80::1%eth0']) {
  assert.equal(ok(yes), true, yes);
}
for (const no of ['8.8.8.8', '172.32.0.1', '172.15.255.255', '100.64.0.1', '100.127.255.255', '169.254.1.1', '2001:db8::1', '::ffff:8.8.8.8', '', 'not-an-ip', '10.0.0.5.5']) {
  assert.equal(ok(no), false, no);
}
assert.equal(ok(undefined), false);

// blank spec == unset, not "allow nothing" and not "allow everything"
assert.equal(privatePeerChecker('  ')('10.0.0.5'), true);
assert.equal(privatePeerChecker('')('8.8.8.8'), false);

// ---- peer allowlist: INTERNAL_ALLOWED_CIDRS replaces the defaults ----
const custom = privatePeerChecker('100.64.0.0/10, 203.0.113.7');
assert.equal(custom('100.64.1.1'), true);
assert.equal(custom('203.0.113.7'), true);
assert.equal(custom('203.0.113.8'), false);
assert.equal(custom('127.0.0.1'), false, 'a custom list replaces the defaults, loopback included');
assert.equal(custom('10.0.0.5'), false);

// ---- bad config fails loudly; it never widens the door ----
for (const bad of ['nope', '10.0.0.0/33', '10.0.0.0/abc', '10.0.0.0/-1', '0.0.0.0/0', '::/0', 'fc00::/129', '10.0.0.0/8,garbage']) {
  assert.throws(() => privatePeerChecker(bad), /INTERNAL_ALLOWED_CIDRS/, bad);
}

console.log('internal-edge-unit: paths classified after decoding; peers allowlisted; bad config throws');
