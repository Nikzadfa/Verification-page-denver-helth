/**
 * Object storage.
 *
 * S3-compatible in production (AWS S3, Cloudflare R2, MinIO); local disk in
 * development so the app runs with no cloud account. Photos of customer
 * equipment are never public — reads go through a presigned URL or, on the
 * local driver, through an authenticated route.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const LOCAL_ROOT = resolve(process.cwd(), '.storage');

export type StorageDriver = 's3' | 'local';

export function driver(): StorageDriver {
  const configured = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (configured === 's3' && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) return 's3';
  return 'local';
}

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3;
}

/**
 * Build a storage key. Includes a random component so an uploaded filename can
 * never be used to guess or overwrite another tenant's object.
 */
export function buildKey(parts: {
  scope: 'photos' | 'documents' | 'reports' | 'logos';
  ownerId: string;
  filename: string;
}): string {
  const ext = parts.filename.includes('.') ? parts.filename.split('.').pop()!.toLowerCase().slice(0, 8) : 'bin';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
  return `${parts.scope}/${parts.ownerId}/${randomUUID()}.${safeExt}`;
}

/**
 * Reject any key that could escape its prefix. The keys we generate are always
 * safe; this guards the paths where a key arrives from a database row that
 * some future code path might populate less carefully.
 */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\0')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; checksum: string; bytes: number }> {
  assertSafeKey(key);
  const checksum = createHash('sha256').update(body).digest('hex');

  if (driver() === 's3') {
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Objects are private; access is always through a presigned URL.
        ACL: undefined,
      }),
    );
  } else {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  return { key, checksum, bytes: body.byteLength };
}

export async function getObject(key: string): Promise<Buffer> {
  assertSafeKey(key);
  if (driver() === 's3') {
    const res = await client().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
    const chunks: Uint8Array[] = [];
    // @ts-expect-error Node stream from the AWS SDK is async-iterable at runtime.
    for await (const chunk of res.Body) chunks.push(chunk as Uint8Array);
    return Buffer.concat(chunks);
  }
  return readFile(localPath(key));
}

export async function deleteObject(key: string): Promise<void> {
  assertSafeKey(key);
  if (driver() === 's3') {
    await client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => undefined);
}

/**
 * A time-limited URL for the browser. On the local driver there is nothing to
 * presign, so callers get an app route that checks authorization itself.
 */
export async function signedUrl(key: string, expiresInSeconds = 900): Promise<string> {
  assertSafeKey(key);
  if (driver() === 's3') {
    return getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
  return `/api/files/${encodeURIComponent(key)}`;
}

function localPath(key: string): string {
  const path = normalize(join(LOCAL_ROOT, key));
  if (!path.startsWith(LOCAL_ROOT + sep)) throw new Error(`Unsafe storage key: ${key}`);
  return path;
}

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 80 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);
