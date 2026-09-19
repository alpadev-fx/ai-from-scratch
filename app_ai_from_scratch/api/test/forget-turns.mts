/**
 * Deleting an account must actually purge the person's chat turns.
 *
 * WHY THIS BOOTS A REAL FASTIFY AND NOT A STUB. The bug this pins had nothing
 * to do with our handler: `forgetTurns` sent a bodyless DELETE that still
 * carried `content-type: application/json`, and Fastify's DEFAULT parser
 * refuses that with FST_ERR_CTP_EMPTY_JSON_BODY *before* any route runs. A
 * hand-rolled node:http stub answers 200 to the same request and proves
 * nothing. Production answered 503 `borrado_incompleto` to every user who
 * tried to delete their account, for as long as the endpoint existed.
 *
 * The messages service (messages/src/server.ts) is a plain Fastify with no
 * custom content-type parser, so this is the same refusal, locally.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import Fastify from 'fastify';

const port = await new Promise<number>((resolve, reject) => {
  const s = createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const a = s.address();
    if (!a || typeof a === 'string') return reject(new Error('no port'));
    const p = a.port; s.close(() => resolve(p));
  });
});

const SECRET = 'test-messages-secret';
const seen: { method: string; url: string; contentType?: string; auth?: string }[] = [];

const store = Fastify();
const record = (req: { method: string; url: string; headers: Record<string, unknown> }) => {
  seen.push({
    method: req.method, url: req.url,
    contentType: req.headers['content-type'] as string | undefined,
    auth: req.headers.authorization as string | undefined,
  });
};
store.delete<{ Querystring: { userId?: string } }>('/v1/turns', async (req) => {
  record(req); return { ok: true, deleted: Number(req.query?.userId ?? 0) };
});
store.get('/v1/turns', async (req) => {
  record(req); return { threadId: 't-1', turns: [] };
});
store.post('/v1/turns', async (req) => {
  record(req); return { id: 'x', createdAt: new Date().toISOString(), body: {} };
});
await store.listen({ host: '127.0.0.1', port });

process.env.MESSAGES_URL = `http://127.0.0.1:${port}`;
process.env.MESSAGES_SECRET = SECRET;
// After the env, because the module reads it at import time.
const { forgetTurns, loadTurns, rememberTurn } = await import('../src/messages-bridge.ts');

try {
  // 1. The purge that account deletion depends on.
  const purged = await forgetTurns(8);
  assert.deepEqual(purged, { ok: true },
    'a bodyless DELETE must be accepted; anything else makes /api/account/delete answer 503');

  const del = seen.find((r) => r.method === 'DELETE');
  assert.ok(del, 'the store must have been called at all');
  assert.equal(del.url, '/v1/turns?userId=8', 'the person is named in the query');
  assert.equal(del.contentType, undefined,
    'a request with no body must not claim to carry JSON: that header is what Fastify refused');
  assert.equal(del.auth, `Bearer ${SECRET}`, 'the service secret still travels');

  // 2. The read is bodyless too. It works today only because Fastify skips
  //    body parsing on GET; the header was still a lie and is gone.
  const read = await loadTurns(8, 'chat');
  assert.ok(!('error' in read), 'reading turns must keep working');
  const get = seen.find((r) => r.method === 'GET');
  assert.equal(get?.contentType, undefined, 'the GET carries no body either');

  // 3. The write DOES carry a body, so it must keep declaring the type. This
  //    is the half of the fix that is easy to break by deleting the header
  //    everywhere.
  await rememberTurn({ userId: 8, source: 'chat', lang: 'es', user: { content: 'hola' } });
  const post = seen.find((r) => r.method === 'POST');
  assert.ok(post, 'the turn must have been sent');
  assert.equal(post.contentType, 'application/json',
    'a POST with a JSON body must declare it, or the store cannot parse it');

  console.log('forget-turns: the purge is accepted, and only the request that has a body claims JSON');
} finally {
  await store.close();
}
