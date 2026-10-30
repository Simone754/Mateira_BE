import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { assertOneLink, assertPdf } from "../../lib/fileLink";
import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid } from "../../lib/validate";
import { type AdminSession, hasSession } from "../../middlewares/adminGuard";
import { prisma } from "../../plugins/prisma";
import {
  documentFilters,
  listAdminDocuments,
  listPublicDocuments,
  parseDocumentCreate,
  parseDocumentPatch,
  publicCategoryFilter,
  serializeDocument,
  WITH_FILE,
} from "./service";

const FILE_GONE = "fileId no longer exists";

export async function handleDocuments(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (parts[0] !== "api" || parts[2] !== "documents") return false;
  if (parts[1] === "public") {
    if (req.method !== "GET" || parts.length !== 3) return false;
    json(res, 200, { documents: await listPublicDocuments(publicCategoryFilter(url)) });
    return true;
  }
  if (parts[1] !== "admin") return false;
  if (!hasSession(res, session)) return true;

  if (parts.length === 3 && req.method === "GET") {
    const rows = await listAdminDocuments(documentFilters(url));
    json(res, 200, { documents: rows.map(serializeDocument) });
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const input = parseDocumentCreate(asObject(await readJson(req)));
    await assertPdf(input.fileId);
    try {
      const created = await prisma.document.create({
        data: { ...input, publishedAt: input.status === "PUBLISHED" ? new Date() : null },
        include: WITH_FILE,
      });
      json(res, 201, serializeDocument(created));
    } catch (err) {
      if (isPrismaError(err, "P2003")) throw httpError(400, FILE_GONE);
      throw err;
    }
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];

    if (req.method === "DELETE") {
      // deleteMany does not throw when a concurrent request got there first.
      const { count } = await prisma.document.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    if (req.method === "GET") {
      const doc = await prisma.document.findUnique({ where: { id }, include: WITH_FILE });
      if (doc) json(res, 200, serializeDocument(doc));
      else notFound(res);
      return true;
    }

    if (req.method === "PATCH") {
      const { fileId, externalUrl, ...rest } = parseDocumentPatch(asObject(await readJson(req)));
      await assertPdf(fileId);
      try {
        const updated = await prisma.$transaction(async (tx) => {
          // The first UPDATE locks the row: concurrent PATCHes serialise, and a concurrent delete ends in P2025 (404).
          // Only then the row is read, so "exactly one of file and link" is checked on what is really stored.
          await tx.document.update({ where: { id }, data: { updatedAt: new Date() } });
          const current = await tx.document.findUniqueOrThrow({ where: { id } });
          const nextFile = fileId !== undefined ? fileId : current.fileId;
          const nextUrl = externalUrl !== undefined ? externalUrl : current.externalUrl;
          assertOneLink(nextFile, nextUrl);

          const data: Prisma.DocumentUncheckedUpdateInput = { ...rest, fileId: nextFile, externalUrl: nextUrl };
          if (rest.status === "PUBLISHED" && !current.publishedAt) data.publishedAt = new Date();
          return tx.document.update({ where: { id }, data, include: WITH_FILE });
        });
        json(res, 200, serializeDocument(updated));
      } catch (err) {
        if (isPrismaError(err, "P2025")) {
          notFound(res);
          return true;
        }
        if (isPrismaError(err, "P2003")) throw httpError(400, FILE_GONE);
        throw err;
      }
      return true;
    }
  }

  return false;
}
