import crypto from "node:crypto";

import type { Media } from "@prisma/client";

import { buildMediaUrl } from "../../plugins/media";
import { MediaDto } from "./dto";

const MB = 1024 * 1024;

export const ALLOWED_TYPES: Record<string, { ext: string; image: boolean; maxBytes: number }> = {
  "image/jpeg": { ext: ".jpg", image: true, maxBytes: 15 * MB },
  "image/png": { ext: ".png", image: true, maxBytes: 15 * MB },
  "image/webp": { ext: ".webp", image: true, maxBytes: 15 * MB },
  "application/pdf": { ext: ".pdf", image: false, maxBytes: 25 * MB },
};

export function newObjectKey(contentType: string, now: Date = new Date()): string {
  const ext = ALLOWED_TYPES[contentType]?.ext ?? "";
  return `media/${now.getUTCFullYear()}/${crypto.randomUUID()}${ext}`;
}

export function serializeMedia(media: Media): MediaDto {
  return {
    id: media.id,
    url: buildMediaUrl(media.bucket, media.objectKey),
    mimeType: media.mimeType,
    size: media.size,
    alt: media.alt,
    createdAt: media.createdAt.toISOString(),
  };
}
