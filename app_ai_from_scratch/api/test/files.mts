import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFiles } from '../src/files.ts';

const KEYS = ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_DEFAULT_REGION', 'AWS_S3_URL_STYLE'];

const withEnv = <T,>(env: Record<string, string | undefined>, run: () => T): T => {
  const saved = { ...process.env };
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try { return run(); } finally { process.env = saved; }
};

const CONFIGURED = {
  AWS_ENDPOINT_URL: 'https://bucket.example.com',
  AWS_ACCESS_KEY_ID: 'key',
  AWS_SECRET_ACCESS_KEY: 'secret',
  AWS_S3_BUCKET_NAME: 'prod-files',
};

test('all unset: no files store, no throw', () => {
  assert.equal(withEnv({}, () => loadFiles()), undefined);
});

test('endpoint without the rest throws', () => {
  assert.throws(() => withEnv({ AWS_ENDPOINT_URL: CONFIGURED.AWS_ENDPOINT_URL }, () => loadFiles()), /set together/);
});

test('bucket name without the rest throws', () => {
  assert.throws(() => withEnv({ AWS_S3_BUCKET_NAME: CONFIGURED.AWS_S3_BUCKET_NAME }, () => loadFiles()), /set together/);
});

test('all four set: a fake client resolving a body returns { body }', async () => {
  const fake = { send: async () => ({ Body: 'pdf-bytes' }) };
  const files = withEnv(CONFIGURED, () => loadFiles(fake));
  assert.ok(files);
  const object = await files!.get('curso-es.pdf');
  assert.deepEqual(object, { body: 'pdf-bytes' });
});

test('a NoSuchKey rejection is reported as a missing object, not thrown', async () => {
  const fake = { send: async () => { const err = new Error('not found'); (err as { name?: string }).name = 'NoSuchKey'; throw err; } };
  const files = withEnv(CONFIGURED, () => loadFiles(fake));
  assert.equal(await files!.get('curso-en.pdf'), undefined);
});

test('any other rejection propagates — a real fault must not read as "file missing"', async () => {
  const fake = { send: async () => { throw new Error('access denied'); } };
  const files = withEnv(CONFIGURED, () => loadFiles(fake));
  await assert.rejects(files!.get('curso-es.pdf'), /access denied/);
});
