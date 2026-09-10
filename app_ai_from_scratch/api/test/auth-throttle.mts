import assert from 'node:assert/strict';
import { authThrottle } from '../src/auth-throttle.ts';

const now = 1_700_000_000_000;
const WINDOW_MS = 60_000;

function fresh() {
  return new Map<string, number>();
}

{
  const map = fresh();
  const r = authThrottle('GET', '/api/auth/login', '1.1.1.1', map, now);
  assert.equal(r.ok, true);
  assert.equal(map.size, 0, 'a non-POST must not consume a slot');
}

{
  const map = fresh();
  const r = authThrottle('POST', '/api/chat', '1.1.1.1', map, now);
  assert.equal(r.ok, true);
  assert.equal(map.size, 0, 'a path absent from AUTH_LIMITS must not consume a slot');
}

{
  const map = fresh();
  for (let i = 0; i < 10; i++) {
    assert.equal(authThrottle('POST', '/api/v1/auth/login', '1.1.1.1', map, now).ok, true);
  }
  assert.equal(authThrottle('POST', '/api/v1/auth/login', '1.1.1.1', map, now).ok, false);
  const v12 = fresh();
  for (let i = 0; i < 10; i++) {
    assert.equal(authThrottle('POST', '/api/v12/auth/login', '1.1.1.1', v12, now).ok, true);
  }
  assert.equal(authThrottle('POST', '/api/v12/auth/login', '1.1.1.1', v12, now).ok, false);
}

{
  const login = fresh();
  for (let i = 0; i < 10; i++) {
    assert.equal(authThrottle('POST', '/api/auth/login', '1.1.1.1', login, now).ok, true);
  }
  assert.equal(authThrottle('POST', '/api/auth/login', '1.1.1.1', login, now).ok, false);

  const register = fresh();
  for (let i = 0; i < 5; i++) {
    assert.equal(authThrottle('POST', '/api/auth/register', '1.1.1.1', register, now).ok, true);
  }
  assert.equal(authThrottle('POST', '/api/auth/register', '1.1.1.1', register, now).ok, false);
}

{
  const map = fresh();
  for (let i = 0; i < 10; i++) {
    assert.equal(authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now).ok, true);
  }
  assert.equal(authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now).ok, false);
  assert.equal(authThrottle('POST', '/api/auth/register', '1.1.1.1', map, now).ok, true,
    'exhausting login must not throttle register');
}

{
  const map = fresh();
  for (let i = 0; i < 10; i++) {
    assert.equal(authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now).ok, true);
  }
  assert.equal(authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now).ok, false);
  assert.equal(authThrottle('POST', '/api/auth/login', '8.8.8.8', map, now).ok, true,
    'exhausting IP A must not throttle IP B');
}

{
  const map = fresh();
  for (let i = 0; i < 10; i++) authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now);
  const rejected = authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.retryAfterS >= 1);
  const body = { error: 'too_many_attempts', retryAfterS: rejected.retryAfterS };
  assert.deepEqual(body, { error: 'too_many_attempts', retryAfterS: rejected.retryAfterS });
  assert.equal(body.error, 'too_many_attempts');
}

{
  const map = fresh();
  for (let i = 0; i < 11; i++) authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now);
  const rolled = authThrottle('POST', '/api/auth/login', '1.1.1.1', map, now + WINDOW_MS);
  assert.equal(rolled.ok, true, 'advancing past 60_000 ms must open a new window');
}

console.log('auth-throttle: POST filter, version strip, per-route limits, buckets, 429 body, window roll ok');
