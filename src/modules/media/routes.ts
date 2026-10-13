import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { MEDIA_BUCKET } from "../../config/settings";
import { badRequest, empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { parseLimit, parsePage } from "../../lib/parse";
import { asObject, isUuid, optString, reqString } from "../../lib/validate";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { createPresignedUpload, deleteMediaObject, isMediaConfigured } from "../../plugins/media";
import { prisma } from "../../plugins/prisma";
import { PresignResponse } from "./dto";
import { findAllowedType, newObjectKey, serializeMedia } from "./service";

const ALT_MAX = 300;

export async function handleMedia(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
): Promise<boolean> {
  if (parts[0] !== "api" || parts[1] !== "admin" || parts[2] !== "media") return false;

  const session = await requireAdmin(req, res);
  if (!session) return true;

  if (req.method === "POST" && parts.length === 4 && parts[3] === "presign") {
    if (!isMediaConfigured()) throw httpError(503, "media storage not configured");

    const body = asObject(await readJson(req));
    const contentType = reqString(body, "contentType", 100).toLowerCase();
    const type = findAllowedType(contentType);
    if (!type) {
      badRequest(res, "unsupported content type");
      return true;
    }

    const size = body.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > type.maxBytes) {
      badRequest(res, `size must be between 1 and ${type.maxBytes} bytes`);
      return true;
    }

    const alt = type.image ? reqString(body, "alt", ALT_MAX) : (optString(body, "alt", ALT_MAX) ?? null);
    const objectKey = newObjectKey(contentType);
    const uploadUrl = await createPresignedUpload(objectKey, contentType, size);
    const media = await prisma.media.create({
      data: { bucket: MEDIA_BUCKET, objectKey, mimeType: contentType, size, alt },
    });

    const response: PresignResponse = {
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": contentType },
      media: serializeMedia(media),
    };
    json(res, 200, response);
    return true;
  }

  if (req.method === "GET" && parts.length === 3) {
    const limit = parseLimit(url.searchParams.get("limit"), 20, 50);
    const page = parsePage(url.searchParams.get("page"));
    const [total, items] = await Promise.all([
      prisma.media.count(),
      prisma.media.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: (page - 1) * limit,
      }),
    ]);
    json(res, 200, { items: items.map(serializeMedia), page, limit, total });
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];
    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) {
      notFound(res);
      return true;
    }

    if (req.method === "PATCH") {
      const body = asObject(await readJson(req));
      const isImage = findAllowedType(media.mimeType)?.image ?? false;
      const alt = optString(body, "alt", ALT_MAX);
      if (alt === undefined) {
        badRequest(res, "alt is required");
        return true;
      }
      if (isImage && !alt) {
        badRequest(res, "alt is required for images");
        return true;
      }
      const updated = await prisma.media.update({ where: { id }, data: { alt } });
      json(res, 200, serializeMedia(updated));
      return true;
    }

    if (req.method === "DELETE") {
      await prisma.media.delete({ where: { id } });
      await deleteMediaObject(media.bucket, media.objectKey);
      empty(res, 204);
      return true;
    }
  }

  return false;
}
