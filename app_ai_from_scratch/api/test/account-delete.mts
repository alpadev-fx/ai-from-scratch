// Account deletion vs the published privacy / registration promises.
//
// The product says: you delete from Settings, credentials stop working, name
// and email and chat go, lab/exam attempts stay without identity, the payment
// record stays, the email is freed, and nobody else's data moves. This suite
// is the proof that the handler actually does that — a missing test here is
// how /perfil kept being advertised as the delete page while the button lived
// on /ajustes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { COOKIE, hashPassword, hashToken, sign, verifyPassword } from '../../auth/src/core.ts';
import { createAuth } from '../../auth/src/index.ts';
import type { AuthDependencies } from '../../auth/src/index.ts';
import { get, run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';
import { faqFor, routesFor } from '../src/product.ts';
import { run as runTool } from '../src/tools/index.ts';

const log = { info: () => {}, warn: () => {}, error: () => {} };
const password = 'SafePass12!';
const ids: number[] = [];

type Forget = NonNullable<AuthDependencies['forgetTurns']>;
type Cancel = NonNullable<AuthDependencies['cancelRenewal']>;

function routes(extra: Partial<AuthDependencies> = {}) {
  const forgetTurns: Forget = extra.forgetTurns ?? (async () => ({ ok: true }));
  const cancelRenewal: Cancel = extra.cancelRenewal ?? (async () => ({ ok: true }));
  const auth = createAuth({
    one, many, write, writeAuthorized,
    origin: 'http://localhost', production: false, log,
    forgetTurns, cancelRenewal, ...extra,
  });
  const map = new Map<string, (req: unknown, reply: unknown) => Promise<unknown>>();
  auth.registerRoutes({
    post(path: string, fn: (req: unknown, reply: unknown) => Promise<unknown>) { map.set(path, fn); },
    get() {},
    patch() {},
  });
  return map;
}

const reply = () => {
  const r: {
    status?: number; body?: unknown; cleared?: boolean;
    code: (n: number) => unknown; send: (v: unknown) => unknown;
    setCookie: () => void; clearCookie: () => void;
  } = {
    setCookie() {},
    clearCookie() { r.cleared = true; },
    code(n) { r.status = n; return r; },
    send(v) { r.body = v; r.status ??= 200; return v; },
  };
  return r;
};

async function insertStudent(tag: string, attrs: Record<string, unknown> = {}) {
  const email = `${tag}-${randomUUID()}@example.test`;
  const hash = await hashPassword(password);
  const row = await get<{ id: number; token_version: number }>(
    `INSERT INTO users (email, name, pass_hash, role, paid, lang, theme, attribution)
     VALUES (?, ?, ?, 'student', 0, 'auto', 'auto', ?::jsonb)
     RETURNING id, token_version`,
    [email, tag, hash, JSON.stringify({ utm: 'ad-1' })]);
  assert.ok(row);
  ids.push(row.id);
  return { ...row, email, ...attrs };
}

function session(user: { id: number; token_version: number }, role = 'student') {
  return { [COOKIE]: sign({ sub: user.id, role, v: user.token_version }) };
}

try {
  const faq = faqFor('borrar cuenta', 'es', 1)[0];
  assert.equal(faq?.id, 'borrar_cuenta');
  assert.match(String(faq?.respuesta), /\/ajustes/);
  assert.equal(routesFor('eliminar cuenta', 'es', 1)[0]?.ruta, '/ajustes');

  const a = await insertStudent('DelA');
  const b = await insertStudent('KeepB');
  const aliasA = `a${a.id}x`.slice(0, 18);
  const aliasB = `b${b.id}x`.slice(0, 18);
  await run('INSERT INTO ranking_optin (user_id, alias) VALUES (?, ?)', [a.id, aliasA]);
  await run('INSERT INTO ranking_optin (user_id, alias) VALUES (?, ?)', [b.id, aliasB]);
  await run('INSERT INTO attempts (user_id, lab_id, answer, correct) VALUES (?, ?, ?, 1)',
    [a.id, '1.1', 'secret-from-a']);
  await run('INSERT INTO attempts (user_id, lab_id, answer, correct) VALUES (?, ?, ?, 1)',
    [b.id, '1.1', 'secret-from-b']);
  await run(
    `INSERT INTO payments (user_id, provider, status, amount, currency, ext_id)
     VALUES (?, 'mercadopago', 'approved', 39990, 'COP', ?)`,
    [a.id, `del-${a.id}`]);
  await write('auth.reset_create', { token: hashToken(`reset-${a.id}`), minutes: 30 }, a.id);

  const priv = await runTool({ userId: a.id, lang: 'es', turn: 'T' }, 'mis_datos_y_privacidad', {}) as {
    borrado?: { ruta?: string };
  };
  assert.equal(priv.borrado?.ruta, '/ajustes', 'the agent must send the student to Settings, not Profile');

  const purged: number[] = [];
  const cancelled: number[] = [];
  const map = routes({
    forgetTurns: async (userId) => { purged.push(userId); return { ok: true }; },
    cancelRenewal: async (userId) => { cancelled.push(userId); return { ok: true }; },
  });
  const del = map.get('/api/account/delete');
  const login = map.get('/api/auth/login');
  const register = map.get('/api/auth/register');
  assert.ok(del && login && register);

  const wrong = reply();
  await del({ body: { password: 'nope-nope' }, cookies: session(a) }, wrong);
  assert.equal(wrong.status, 401);
  assert.equal((wrong.body as { error?: string }).error, 'clave_incorrecta');

  const gone = reply();
  const goneBody = await del({ body: { password }, cookies: session(a) }, gone);
  assert.deepEqual(goneBody, { ok: true, deleted: a.id });
  assert.equal(gone.cleared, true);
  assert.deepEqual(purged, [a.id], 'chat purge is scoped to the acting user');
  assert.deepEqual(cancelled, [a.id], 'renewal cancel is scoped to the acting user');

  const after = await get<{
    email: string; name: string; pass_hash: string; deleted_at: Date | null;
    token_version: number; attribution: unknown;
  }>('SELECT email, name, pass_hash, deleted_at, token_version, attribution FROM users WHERE id = ?', [a.id]);
  assert.ok(after?.deleted_at, 'deleted_at is set');
  assert.equal(after.email, `borrado+${a.id}@alpadev.local`);
  assert.equal(after.name, 'Cuenta borrada');
  assert.equal(after.attribution, null);
  assert.equal(after.token_version, a.token_version + 1);
  assert.equal(await verifyPassword(password, after.pass_hash), false,
    'the old password must not verify against the destroyed hash');

  const stillMe = await get<{ id: number }>('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [a.id]);
  assert.equal(stillMe, null, 'auth lookups that filter deleted_at must miss the row');

  const neighbor = await get<{ email: string; name: string; deleted_at: Date | null }>(
    'SELECT email, name, deleted_at FROM users WHERE id = ?', [b.id]);
  assert.equal(neighbor?.email, b.email);
  assert.equal(neighbor?.name, 'KeepB');
  assert.equal(neighbor?.deleted_at, null);

  const attemptA = await get<{ answer: string; user_id: number }>(
    'SELECT answer, user_id FROM attempts WHERE user_id = ?', [a.id]);
  assert.equal(attemptA?.answer, 'secret-from-a', 'attempts stay, without the identity columns');
  const attemptB = await get<{ answer: string }>(
    'SELECT answer FROM attempts WHERE user_id = ?', [b.id]);
  assert.equal(attemptB?.answer, 'secret-from-b');

  assert.equal(await get('SELECT user_id FROM ranking_optin WHERE user_id = ?', [a.id]), null);
  const rankB = await get<{ alias: string }>('SELECT alias FROM ranking_optin WHERE user_id = ?', [b.id]);
  assert.equal(rankB?.alias, aliasB);

  const pay = await get<{ status: string; amount: number }>(
    'SELECT status, amount FROM payments WHERE user_id = ?', [a.id]);
  assert.equal(pay?.status, 'approved');
  assert.equal(Number(pay?.amount), 39990);

  const leftoverReset = await get<{ c: string }>(
    'SELECT COUNT(*)::text AS c FROM reset_tokens WHERE user_id = ? AND used_at IS NULL', [a.id]);
  assert.equal(Number(leftoverReset?.c ?? 1), 0, 'unused recovery tokens die with the account');

  const blocked = reply();
  await login({ body: { email: a.email, password } }, blocked);
  assert.equal(blocked.status, 401);

  const reused = reply();
  await register({ body: { email: a.email, name: 'Back', password, acepta: true } }, reused);
  assert.equal(reused.status, 201, JSON.stringify(reused.body));
  const backId = (reused.body as { user?: { id?: number } }).user?.id;
  assert.ok(backId && backId !== a.id, 'reuse creates a new account, not the anonymized row');
  ids.push(backId);

  const other = reply();
  const otherBody = await del({ body: { password }, cookies: session(b) }, other);
  assert.deepEqual(otherBody, { ok: true, deleted: b.id });
  const bAfter = await get<{ email: string }>('SELECT email FROM users WHERE id = ?', [b.id]);
  assert.equal(bAfter?.email, `borrado+${b.id}@alpadev.local`);
  const aStill = await get<{ email: string }>('SELECT email FROM users WHERE id = ?', [a.id]);
  assert.equal(aStill?.email, `borrado+${a.id}@alpadev.local`, 'deleting B must not retouch A');

  const failChat = await insertStudent('FailChat');
  const chatMap = routes({ forgetTurns: async () => ({ error: 'messages_unreachable' }) });
  const chatDel = chatMap.get('/api/account/delete')!;
  const incomplete = reply();
  await chatDel({ body: { password }, cookies: session(failChat) }, incomplete);
  assert.equal(incomplete.status, 503);
  assert.equal((incomplete.body as { error?: string }).error, 'borrado_incompleto');
  const chatRow = await get<{ deleted_at: Date | null }>(
    'SELECT deleted_at FROM users WHERE id = ?', [failChat.id]);
  assert.equal(chatRow?.deleted_at, null, 'a chat-store failure must not anonymize the row');

  const failPay = await insertStudent('FailPay');
  const payMap = routes({ cancelRenewal: async () => ({ error: 'payments_503' }) });
  const payDel = payMap.get('/api/account/delete')!;
  const payIncomplete = reply();
  await payDel({ body: { password }, cookies: session(failPay) }, payIncomplete);
  assert.equal(payIncomplete.status, 503);
  const payRow = await get<{ deleted_at: Date | null }>(
    'SELECT deleted_at FROM users WHERE id = ?', [failPay.id]);
  assert.equal(payRow?.deleted_at, null, 'a live payments cancel failure must not anonymize the row');

  const lastAdmin = await get<{ id: number; token_version: number }>(
    `INSERT INTO users (email, name, pass_hash, role, paid, lang, theme)
     VALUES (?, 'LastAdmin', ?, 'admin', 0, 'auto', 'auto') RETURNING id, token_version`,
    [`last-admin-${randomUUID()}@example.test`, await hashPassword(password)]);
  assert.ok(lastAdmin);
  ids.push(lastAdmin.id);
  const adminOne: AuthDependencies['one'] = async (op, args, actor) => {
    if (op === 'auth.admin_count') return { c: 1 } as never;
    return one(op, args, actor);
  };
  const adminMap = routes({ one: adminOne });
  const adminDel = adminMap.get('/api/account/delete')!;
  const last = reply();
  await adminDel({ body: { password }, cookies: session(lastAdmin, 'admin') }, last);
  assert.equal(last.status, 409);
  assert.equal((last.body as { error?: string }).error, 'ultimo_admin');

  console.log('account-delete: credentials die, identity goes, attempts and payment stay, email is freed, neighbor is untouched');
} finally {
  for (const id of ids) await run('DELETE FROM users WHERE id = ?', [id]);
  await pool.end();
}
