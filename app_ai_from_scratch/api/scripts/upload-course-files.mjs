// One-shot migration / republish tool for the course PDF bucket (AI-56).
// Run by hand, against Production credentials, whenever api/files/*.pdf
// changes -- publishing a new PDF no longer needs an API rebuild+redeploy,
// it needs this command:
//
//   env AWS_ENDPOINT_URL=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
//       AWS_S3_BUCKET_NAME=... AWS_DEFAULT_REGION=... AWS_S3_URL_STYLE=... \
//     node --experimental-strip-types api/scripts/upload-course-files.mjs
//
// or, with a Production .env sourced: pnpm --dir api run files:upload
//
// The flag is needed because this script imports src/files.ts directly: Node
// 22.13 reports process.features.typescript === false, so type stripping is
// not on by default -- same reason api/scripts/close-leagues.mjs needs it.
//
// Reuses resolveFilesConfig() from src/files.ts so this script validates and
// defaults AWS_S3_URL_STYLE/AWS_DEFAULT_REGION exactly the way the running
// server does -- it must never drift into its own copy of that logic.
import { readdirSync, readFileSync } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { resolveFilesConfig } from '../src/files.ts';

const config = resolveFilesConfig();
if (!config) {
  console.error('AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET_NAME must all be set -- refusing to guess a target bucket.');
  process.exit(1);
}

const client = new S3Client({
  endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
});

const filesDir = new URL('../files/', import.meta.url);
const pdfs = readdirSync(filesDir).filter((name) => name.endsWith('.pdf'));
if (pdfs.length === 0) {
  console.error(`no *.pdf found under ${filesDir.pathname} -- nothing to upload.`);
  process.exit(1);
}

for (const name of pdfs) {
  const body = readFileSync(new URL(name, filesDir));
  await client.send(new PutObjectCommand({
    Bucket: config.bucket, Key: name, Body: body, ContentType: 'application/pdf',
  }));
  console.log(`uploaded ${name} (${body.length} bytes) to ${config.bucket}`);
}
