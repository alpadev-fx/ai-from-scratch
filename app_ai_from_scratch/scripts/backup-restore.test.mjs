import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESTORE = resolve(ROOT, 'scripts/restore.sh');
const DRILL = resolve(ROOT, 'scripts/backup-drill.sh');
const DUMP_URL = resolve(ROOT, 'scripts/dump-url.sh');
const INTEGRITY = resolve(ROOT, 'scripts/backup-integrity.sql');

const sh = (args, opts = {}) =>
  spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 180_000, ...opts });

test('restore.sh with no dump fails closed', () => {
  const r = sh(['sh', RESTORE]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: restore\.sh/);
});

test('restore.sh with a missing dump fails closed', () => {
  const r = sh(['sh', RESTORE, '/no/such/dump.dump']);
  assert.equal(r.status, 1);
});

test('restore.sh never targets compose live databases', () => {
  const src = readFileSync(RESTORE, 'utf8');
  assert.doesNotMatch(src, /docker compose/);
  assert.doesNotMatch(src, /\b(payments-db|messages-db)\b/);
  assert.match(src, /throwaway|Never the live DB/i);
  assert.match(src, /select 1/, 'ready means a query works, not only pg_isready');
});

test('dump-url.sh without DATABASE_URL fails closed', () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const r = sh(['sh', DUMP_URL, '/tmp/aifs-no-url.dump'], { env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: DATABASE_URL=/);
});

test('a dump without the canary fails integrity, not silently pass', () => {
  assert.equal(sh(['sh', '-c', 'command -v docker']).status, 0, 'docker is required');
  const dir = mkdtempSync(resolve(tmpdir(), 'aifs-restore-'));
  const dump = resolve(dir, 'no-canary.dump');
  const cid = sh(['docker', 'run', '-d', '--rm', '-e', 'POSTGRES_PASSWORD=empty', 'postgres:17-alpine']);
  assert.equal(cid.status, 0, cid.stderr);
  const id = cid.stdout.trim();
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const ping = sh(['docker', 'exec', id, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1']);
      if (ping.status === 0) {
        ready = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
    assert.ok(ready, 'empty postgres never became ready');
    const sql = sh(['docker', 'exec', '-i', id, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
      input: `CREATE TABLE users (id int, email text, paid smallint);
CREATE TABLE entitlement_events (event_key text, active boolean);
INSERT INTO users VALUES (1, 'other@x.test', 0);
`,
    });
    assert.equal(sql.status, 0, sql.stderr);
    const dumpRun = sh(['sh', '-c', `docker exec ${id} pg_dump -Fc -U postgres postgres > "${dump}"`]);
    assert.equal(dumpRun.status, 0, dumpRun.stderr);
  } finally {
    sh(['docker', 'stop', id]);
  }
  const r = sh(['sh', RESTORE, dump, INTEGRITY]);
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /^integrity ok$/m);
});

test('backup-drill restores a fixture and checks account and entitlement integrity', () => {
  const r = sh(['sh', DRILL]);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  assert.match(r.stdout, /restore ok/);
  assert.match(r.stdout, /integrity ok/);
  assert.match(r.stdout, /canary@restore\.test/);
});
