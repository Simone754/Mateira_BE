import type { Media } from "@prisma/client";

import { parseHttpUrl } from "../modules/news/service";
import { findAllowedType, serializeMedia } from "../modules/media/service";
import { prisma } from "../plugins/prisma";
import { httpError } from "./httpErrors";
import { optString, optUuid } from "./validate";

type Obj = Record<string, unknown>;

/** Documents and publications point to an uploaded PDF (a Media) or to an external address: exactly one of the two. */
export const EXTERNAL_URL_MAX = 500;
export const FILE_OR_URL = "a file or an external URL is required, not both";

export type LinkFields = { fileId?: string | null; externalUrl?: string | null };

export type LinkPublic = { url: string | null; kind: "file" | "external"; mimeType: string | null };
export type FileRef = { id: string; url: string | null; mimeType: string; alt: string | null };

/** `fileId` and `externalUrl` of a request body: undefined = not sent, null (or an empty string) = cleared. */
export function parseLinkFields(o: Obj): LinkFields {
  const out: LinkFields = {};
  const fileId = o.fileId === "" ? null : optUuid(o, "fileId");
  if (fileId !== undefined) out.fileId = fileId ? fileId.toLowerCase() : null;
  const externalUrl = optString(o, "externalUrl", EXTERNAL_URL_MAX);
  if (externalUrl !== undefined) out.externalUrl = externalUrl === null ? null : parseHttpUrl(externalUrl, "externalUrl");
  return out;
}

/** 400 unless exactly one of the two is set. */
export function assertOneLink(fileId: string | null, externalUrl: string | null): void {
  if ((fileId === null) === (externalUrl === null)) throw httpError(400, FILE_OR_URL);
}

/** 400 when the file is not an existing PDF. */
export async function assertPdf(fileId: string | null | undefined): Promise<void> {
  if (!fileId) return;
  const media = await prisma.media.findUnique({ where: { id: fileId }, select: { mimeType: true } });
  if (!media) throw httpError(400, "fileId does not match an existing media");
  if (media.mimeType !== "application/pdf" || !findAllowedType(media.mimeType)) {
    throw httpError(400, "fileId must be a PDF");
  }
}

export function serializeFile(media: Media | null): FileRef | null {
  if (!media) return null;
  const { id, url, mimeType, alt } = serializeMedia(media);
  return { id, url, mimeType, alt };
}

/** The link the site shows, or null when the item has neither (its file was deleted). */
export function publicLink(row: { file: Media | null; externalUrl: string | null }): LinkPublic | null {
  if (row.file) return { url: serializeMedia(row.file).url, kind: "file", mimeType: row.file.mimeType };
  if (row.externalUrl) return { url: row.externalUrl, kind: "external", mimeType: null };
  return null;
}

/** Prisma `where` of the items that have a link. */
export const HAS_LINK: { OR: { fileId?: { not: null }; externalUrl?: { not: null } }[] } = {
  OR: [{ fileId: { not: null } }, { externalUrl: { not: null } }],
};
