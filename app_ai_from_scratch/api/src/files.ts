// Course PDF storage via a Railway S3-compatible bucket. Used today for
// GET /api/pdf/:lang (api/src/server.ts). Without it, the route falls back to
// reading api/files/ off local disk — that fallback already exists and does
// not change here; it is what every non-Railway environment still uses.
//
// AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and
// AWS_S3_BUCKET_NAME are all-or-nothing, same shape as mail.ts's RESEND_API_KEY
// + MAIL_FROM: half a configuration is a misconfiguration, not a degraded mode,
// so it throws at boot instead of silently disabling storage or silently
// reading from the wrong bucket. AWS_DEFAULT_REGION and AWS_S3_URL_STYLE are
// optional with defaults, since a custom S3-compatible endpoint (not real AWS)
// makes region mostly decorative and path-style is the common case for one.

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const env = (k: string): string | null => { const v = process.env[k]; return v && v.trim() ? v.trim() : null; };

export interface Files {
  get(key: string): Promise<{ body: NodeJS.ReadableStream } | undefined>;
}

interface S3Like {
  send(command: GetObjectCommand): Promise<{ Body?: unknown }>;
}

function s3Files(client: S3Like, bucket: string): Files {
  return {
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: res.Body as NodeJS.ReadableStream };
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'NoSuchKey') return undefined;
        throw err;
      }
    },
  };
}

export interface FilesConfig {
  endpoint: string; region: string; forcePathStyle: boolean;
  accessKeyId: string; secretAccessKey: string; bucket: string;
}

/**
 * Shared by loadFiles() and api/scripts/upload-course-files.mjs, so the
 * migration script validates and defaults the same six vars the exact same
 * way instead of re-implementing this check.
 */
export function resolveFilesConfig(): FilesConfig | undefined {
  const endpoint = env('AWS_ENDPOINT_URL');
  const accessKeyId = env('AWS_ACCESS_KEY_ID');
  const secretAccessKey = env('AWS_SECRET_ACCESS_KEY');
  const bucket = env('AWS_S3_BUCKET_NAME');
  const required = [endpoint, accessKeyId, secretAccessKey, bucket];
  if (required.every((v) => v === null)) return undefined;
  if (required.some((v) => v === null)) {
    throw new Error('AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET_NAME must be set together (or all unset)');
  }
  const region = env('AWS_DEFAULT_REGION') ?? 'auto';
  const forcePathStyle = env('AWS_S3_URL_STYLE') !== 'virtual';
  return { endpoint: endpoint!, region, forcePathStyle, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey!, bucket: bucket! };
}

/** `clientOverride` is a test seam — see api/test/files.mts. */
export function loadFiles(clientOverride?: S3Like): Files | undefined {
  const config = resolveFilesConfig();
  if (!config) return undefined;
  const client = clientOverride ?? new S3Client({
    endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return s3Files(client, config.bucket);
}

/** undefined when unconfigured — callers already handle that (local-disk fallback in dev, fail-closed 503 in production). */
export const filesStore: Files | undefined = loadFiles();
