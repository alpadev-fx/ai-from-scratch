// Remove accounts from course-db, keeping an explicit list.
//
//   node --experimental-strip-types api/scripts/db-clean.mjs                    # counts only, writes nothing
//   node --experimental-strip-types api/scripts/db-clean.mjs --keep=root,a@b.co --delete
//
// On Railway the compiled copy is inside the api image:
//
//   railway ssh --service api --environment Production \
//     node dist/api/scripts/db-clean.mjs
//
// DRY RUN IS THE DEFAULT. Nothing is written without `--delete`.
//
// WHY THIS SCRIPT EXISTS RATHER THAN A `DELETE FROM users`
//
// `api/prisma/migrations/00000000000000_baseline/migration.sql:228`:
//
//   ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_user_id_fkey"
//     FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
//     ON DELETE SET NULL ON UPDATE NO ACTION;
//
// `ON DELETE SET NULL`, not CASCADE and not RESTRICT. So deleting a user does
// NOT fail and does NOT remove the payment: it nulls `payments.user_id` and the
// row survives with no owner. After that nobody can say who paid, so nobody's
// access can be reinstated, and the money is unattributable. That loss is
// silent and permanent, which is why this script dumps the
// (user -> payment) pairs BEFORE deleting and refuses to proceed if it cannot.
//
// Every other user-referencing table in course-db is `ON DELETE CASCADE`
// (achievements, attempts, question_attempts, league_week, ranking_optin,
// reset_tokens, entitlement_events, auth_throttles), so those rows go with the
// user and need no separate statement. `role_audit` declares no foreign key at
// all: its rows survive with ids that no longer resolve.
//
// WHAT THIS SCRIPT DOES NOT TOUCH
//
// Two other databases hold per-person data and neither is reachable from here:
//   - payments-db (payments service, tables created in payments/src/db.ts):
//     payments, subscriptions, coupon_redemptions, entitlement_deliveries,
//     checkout_contexts, checkout_orders, meta_events, payment_webhook_events.
//   - messages-db (messages/src/store.ts): the `docs` table, the AI chat log.
// Cleaning course-db alone leaves those as orphans. That is a deliberate
// choice, not an oversight: financial and webhook records are the audit trail
// of money that actually moved, and deleting them is a separate decision with
// separate consequences.
//
// THERE ARE NO SEED USERS IN PRODUCTION, so `--keep` cannot be inferred.
// api/src/seed.ts seeds CONTENT. The four accounts it knows about all refuse to
// exist in production by construction:
//   ricardo@velez.co, paula@correo.com, founder.alpadev@gmail.com
//     -> SEED_DEMO_USERS=1 throws when NODE_ENV=production (seed.ts:445)
//   root
//     -> SEED_ROOT_USER=1 throws when NODE_ENV=production, and again when the
//        database host is not localhost (seed.ts:22, seed.ts:26)
// The only production-legitimate privileged account is the one
// api/init/bootstrap-root.ts creates from BOOTSTRAP_ROOT_USER. Pass it to
// `--keep` by name or you will delete your own way in.
// `../src/db.ts` is imported DYNAMICALLY, below the argument guard, and that is
// deliberate. An ESM `import` runs at module load, before any top-level
// statement in this file, and db.ts:20 throws `DATABASE_URL is required` at
// that point. With a static import the guard against an empty keep list never
// ran: a mistyped invocation reported a missing DSN instead of the real
// problem, which is the wrong error to show someone about to delete accounts.
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? null : hit.slice(name.length + 3);
};

const commit = flag('delete');
const keepNone = flag('keep-none');
const keepRaw = value('keep');
const dumpPath = value('dump') ?? `/tmp/db-clean-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

const keep = (keepRaw ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length > 0);

if (keep.length === 0 && !keepNone) {
  throw new Error(
    'Refusing to run with an empty keep list. There are no seed users in production, '
    + 'so "keep the seed users" resolves to keeping nobody, which deletes every account '
    + 'including the bootstrap root you log in with. Pass --keep=<comma,separated,logins> '
    + 'or, if deleting every account really is the intent, --keep-none.');
}

// ---------- read ----------

const { pool, ready } = await import('../src/db.ts');
await ready();

const TABLES = ['users', 'achievements', 'attempts', 'question_attempts', 'league_week',
  'ranking_optin', 'reset_tokens', 'entitlement_events', 'auth_throttles', 'payments',
  'role_audit', 'jobs'];

const counts = {};
for (const t of TABLES) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "${t}"`);
  counts[t] = rows[0].n;
}

const { rows: allUsers } = await pool.query(
  `SELECT id, email, name, role, paid, cohort, created_at, deleted_at
     FROM users ORDER BY id`);

const doomed = allUsers.filter((u) => !keep.includes(String(u.email).toLowerCase()));
const kept = allUsers.filter((u) => keep.includes(String(u.email).toLowerCase()));
const missing = keep.filter((k) => !allUsers.some((u) => String(u.email).toLowerCase() === k));

// The pairs that ON DELETE SET NULL is about to destroy.
const { rows: linkedPayments } = doomed.length === 0 ? { rows: [] } : await pool.query(
  `SELECT p.id, p.user_id, u.email, p.provider, p.ext_id, p.status, p.amount, p.currency, p.at
     FROM payments p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ANY($1::int[])
    ORDER BY p.at`,
  [doomed.map((u) => u.id)]);

const { rows: paidDoomed } = doomed.length === 0 ? { rows: [] } : await pool.query(
  `SELECT count(*)::int AS n FROM users WHERE id = ANY($1::int[]) AND paid = 1`,
  [doomed.map((u) => u.id)]);

// ---------- report ----------

console.log(`\nenvironment      NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} APP_ENV=${process.env.APP_ENV ?? '(unset)'}`);
console.log(`mode             ${commit ? 'DELETE (writes)' : 'dry run (writes nothing)'}`);
console.log(`keep list        ${keep.length === 0 ? '(none — --keep-none)' : keep.join(', ')}`);
if (missing.length > 0) {
  console.log(`keep NOT FOUND   ${missing.join(', ')}  <-- these logins do not exist in this database`);
}

console.log('\nrow counts before');
for (const t of TABLES) console.log(`  ${t.padEnd(20)} ${String(counts[t]).padStart(8)}`);

console.log(`\nusers            ${allUsers.length} total · ${kept.length} kept · ${doomed.length} to delete`);
console.log(`  of those to delete, paid = 1: ${paidDoomed[0]?.n ?? 0}`);
console.log(`  payment rows that will lose their owner (ON DELETE SET NULL): ${linkedPayments.length}`);

if (doomed.length > 0) {
  console.log('\naccounts that would be deleted');
  for (const u of doomed) {
    console.log(`  id=${String(u.id).padStart(6)} role=${String(u.role).padEnd(7)} paid=${u.paid}`
      + ` created=${u.created_at?.toISOString?.().slice(0, 19) ?? u.created_at}`
      + ` deleted_at=${u.deleted_at ? 'yes' : 'no'}  ${u.email}`);
  }
}

if (!commit) {
  console.log('\nNothing was written. Re-run with --delete to apply.');
  await pool.end();
  process.exit(0);
}

// ---------- write ----------

if (doomed.length === 0) {
  console.log('\nNothing to delete.');
  await pool.end();
  process.exit(0);
}

// The dump is the only thing standing between this and an unattributable
// payments table. Write it first and fail closed if it cannot be written.
const dump = {
  takenAt: new Date().toISOString(),
  nodeEnv: process.env.NODE_ENV ?? null,
  appEnv: process.env.APP_ENV ?? null,
  keep,
  countsBefore: counts,
  deletedUsers: doomed,
  paymentsLosingOwner: linkedPayments,
};
try {
  writeFileSync(dumpPath, JSON.stringify(dump, (_k, v) => (typeof v === 'bigint' ? String(v) : v), 2));
} catch (err) {
  const why = err instanceof Error ? err.message : String(err);
  throw new Error(`refusing to delete: could not write the recovery dump to ${dumpPath}: ${why}`);
}
console.log(`\nrecovery dump    ${dumpPath}  (${linkedPayments.length} user->payment pairs)`);
console.log('COPY THAT FILE OFF THE CONTAINER BEFORE IT RESTARTS. /tmp does not survive a redeploy.');

const client = await pool.connect();
let deleted = 0;
try {
  await client.query('BEGIN');
  const res = await client.query('DELETE FROM users WHERE id = ANY($1::int[])',
    [doomed.map((u) => u.id)]);
  deleted = res.rowCount ?? 0;
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}

const after = {};
for (const t of TABLES) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "${t}"`);
  after[t] = rows[0].n;
}
const { rows: orphans } = await pool.query(
  'SELECT count(*)::int AS n FROM payments WHERE user_id IS NULL');

console.log(`\ndeleted          ${deleted} accounts`);
console.log('row counts after');
for (const t of TABLES) {
  const d = after[t] - counts[t];
  console.log(`  ${t.padEnd(20)} ${String(after[t]).padStart(8)}  ${d === 0 ? '' : `(${d > 0 ? '+' : ''}${d})`}`);
}
console.log(`\npayments with no owner now: ${orphans[0].n}`);
console.log('payments-db and messages-db were NOT touched. See the header of this file.');

await pool.end();
