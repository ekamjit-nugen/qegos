import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileStorageConfig } from '../types';
import { PRESIGNED_URL_EXPIRY } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let s3Client: S3Client;
let bucket: string;
let quarantineBucket: string;
let urlExpiry: number;

export function initS3Service(config: FileStorageConfig): void {
  s3Client = new S3Client({
    region: config.s3Region,
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
  });
  bucket = config.s3Bucket;
  quarantineBucket = config.s3QuarantineBucket;
  urlExpiry = config.presignedUrlExpiry ?? PRESIGNED_URL_EXPIRY;
}

// ─── S3 Path Builder (CPV-INV-02) ──────────────────────────────────────────

/**
 * Build S3 key: vault/{userId}/{financialYear}/{uuid}-{filename}
 */
export function buildS3Key(
  userId: string,
  financialYear: string,
  uuid: string,
  fileName: string,
): string {
  return `vault/${userId}/${financialYear}/${uuid}-${fileName}`;
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  mimeType: string,
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
  return key;
}

/**
 * Upload infected file to quarantine bucket (CPV-INV-01).
 */
export async function quarantineFile(
  buffer: Buffer,
  key: string,
  mimeType: string,
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: quarantineBucket,
      Key: `quarantine/${key}`,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * STR-INV-04: S3 delete first, then counter decrement.
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

// ─── Presigned URL (CPV-INV-03) ─────────────────────────────────────────────

/**
 * Generate on-demand presigned URL. Never cached or stored.
 * Expires in 15 minutes (900 seconds) by default.
 */
export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: urlExpiry });
}
