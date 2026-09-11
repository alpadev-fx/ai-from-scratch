import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../../auth/src/index.ts';
import { get, run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';

const log = { info: () => {}, warn: () => {}, error: () => {} };
const auth = createAuth({ one, many, write, writeAuthorized,
  origin: 'http://localhost', production: false, log });
const email = `auth-boundary-${randomUUID()}@example.test`;
const user = await get<{ id: number; token_version: number }>(
  `INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
   VALUES (?,?,?,'student',0,'auto','auto') RETURNING id,token_version`,
  [email, 'Boundary', 'test-only-not-a-password-hash']);
assert.ok(user);
const extra: number[] = [];

try {
  const first = await auth.applyEntitlement({ eventKey: `grant:${user.id}`, userId: user.id,
    active: true, source: 'test.subscription', externalId: 'sub-1', occurredAt: new Date().toISOString() });
  assert.deepEqual(first, { accepted: true, active: true });

  const duplicate = await auth.applyEntitlement({ eventKey: `grant:${user.id}`, userId: user.id,
    active: true, source: 'test.subscription', externalId: 'sub-1', occurredAt: new Date().toISOString() });
  assert.deepEqual(duplicate, { accepted: false, active: true });

  const revoke = await auth.applyEntitlement({ eventKey: `revoke:${user.id}`, userId: user.id,
    active: false, source: 'test.subscription', externalId: 'sub-1',
    occurredAt: new Date(Date.now() + 1_000).toISOString() });
  assert.deepEqual(revoke, { accepted: true, active: false });

  // The lapse sweep closes only what it can see. paid = 1 with NO events (a buyer
  // from before entitlement_events existed, a seeded demo, a hand grant) has
  // nothing to lapse and must survive it; an account whose only grant expired
  // must not. The first version swept both: NOT EXISTS is true for "no events".
  const legacy = await get<{ id: number }>(`INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
     VALUES (?,?,?,'student',1,'auto','auto') RETURNING id`, [`legacy-${email}`, 'Legacy', 'test-only-not-a-password-hash']);
  const lapsed = await get<{ id: number }>(`INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
     VALUES (?,?,?,'student',0,'auto','auto') RETURNING id`, [`lapsed-${email}`, 'Lapsed', 'test-only-not-a-password-hash']);
  assert.ok(legacy && lapsed);
  extra.push(legacy.id, lapsed.id);
  const expired = await auth.applyEntitlement({ eventKey: `expired:${lapsed.id}`, userId: lapsed.id, active: true,
    source: 'test.payment', externalId: 'pay-1', occurredAt: new Date(Date.now() - 2_000).toISOString(),
    periodEnd: new Date(Date.now() - 1_000).toISOString() });
  assert.deepEqual(expired, { accepted: true, active: false });
  await run('UPDATE users SET paid = 1 WHERE id = ?', [lapsed.id]);   // the stale cache the sweep exists for
  await write('auth.entitlement_sweep', {});
  const paidOf = async (id: number) => Number((await get<{ paid: number }>('SELECT paid FROM users WHERE id = ?', [id]))?.paid);
  assert.equal(await paidOf(legacy.id), 1, 'no events: the sweep must not touch the account');
  assert.equal(await paidOf(lapsed.id), 0, 'expired grant: the sweep must close the account');
  assert.equal(await paidOf(user.id), 0, 'revoked grant: stays closed');

  const throttle = await auth.applyDefenseAction({ kind: 'throttle_identity', target: String(user.id),
    ttlSeconds: 120, why: 'integration test' });
  assert.equal(throttle.applied, true);
  assert.ok(await get('SELECT user_id FROM auth_throttles WHERE user_id = ? AND expires_at > now()', [user.id]));

  const revokeSession = await auth.applyDefenseAction({ kind: 'revoke_session', target: String(user.id),
    ttlSeconds: 120 });
  assert.equal(revokeSession.applied, true);
  const after = await get<{ token_version: number }>('SELECT token_version FROM users WHERE id = ?', [user.id]);
  assert.equal(after?.token_version, user.token_version + 1);

  assert.deepEqual(await auth.applyDefenseAction({ kind: 'review_subscription', target: String(user.id),
    ttlSeconds: 120 }), { applied: false });
  console.log('auth boundary: entitlement idempotency, lapse sweep and defense controls ok');
} finally {
  for (const id of extra) await run('DELETE FROM users WHERE id = ?', [id]);
  await run('DELETE FROM users WHERE id = ?', [user.id]);
  await pool.end();
}
