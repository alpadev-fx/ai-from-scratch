import assert from 'node:assert/strict';
import test from 'node:test';
import { HSTS, overTls } from '../src/lib/hsts.ts';

test('the forwarded protocol wins, because behind the proxy the app always speaks http', () => {
  assert.equal(overTls('https', 'http:'), true, 'this is the shape every real request has in production');
  assert.equal(overTls('http', 'https:'), false, 'a plaintext visitor gets no HSTS even if the hop is TLS');
});

test('a proxy chain names the client first', () => {
  assert.equal(overTls('https,http', 'http:'), true);
  assert.equal(overTls('http, https', 'http:'), false, 'the second hop is not the person');
  assert.equal(overTls(' HTTPS ', 'http:'), true, 'header values are not case sensitive');
});

test('with no proxy the request speaks for itself', () => {
  assert.equal(overTls(null, 'https:'), true, 'running the server directly over TLS');
  assert.equal(overTls(null, 'http:'), false, 'local dev must not hand out HSTS: it would pin localhost');
});

test('the max-age is small on purpose, and changing it is a decision', () => {
  // HSTS cannot be withdrawn from a browser that already cached it. If this
  // number grows before a certificate renewal has been watched through a full
  // cycle, a lapse takes the site down for everyone holding the header, with no
  // way to reach them. Raise it deliberately, not by editing past this test.
  assert.equal(HSTS, 'max-age=300');
  assert.ok(!HSTS.includes('includeSubDomains'), 'subdomains are a separate, wider decision');
  assert.ok(!HSTS.includes('preload'), 'preload is effectively permanent and is not ours to set here');
});
