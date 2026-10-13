import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  MEDIA_ACCESS_KEY,
  MEDIA_BUCKET,
  MEDIA_ENDPOINT,
  MEDIA_FORCE_PATH_STYLE,
  MEDIA_PRESIGN_EXPIRES_IN,
  MEDIA_PUBLIC_BASE_URL,
  MEDIA_REGION,
  MEDIA_SECRET_KEY,
} from "../config/settings";

let client: S3Client | null = null;

export function isMediaConfigured(): boolean {
  return Boolean(MEDIA_ENDPOINT && MEDIA_ACCESS_KEY && MEDIA_SECRET_KEY && MEDIA_BUCKET);
}

function getMediaClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: MEDIA_REGION,
      endpoint: MEDIA_ENDPOINT,
      forcePathStyle: MEDIA_FORCE_PATH_STYLE,
      credentials: { accessKeyId: MEDIA_ACCESS_KEY, secretAccessKey: MEDIA_SECRET_KEY },
    });
  }
  return client;
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function buildMediaUrl(bucket: string, objectKey: string): string | null {
  if (!MEDIA_PUBLIC_BASE_URL) return null;
  return `${MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${stripSlashes(bucket)}/${stripSlashes(objectKey)}`;
}

export async function createPresignedUpload(objectKey: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey, ContentType: contentType });
  return getSignedUrl(getMediaClient(), command, { expiresIn: MEDIA_PRESIGN_EXPIRES_IN });
}

export async function deleteMediaObject(bucket: string, objectKey: string): Promise<void> {
  try {
    await getMediaClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  } catch (err) {
    console.warn("Failed to delete media object", err);
  }
}
