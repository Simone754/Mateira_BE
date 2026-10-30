import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { assertOneLink, assertPdf, HAS_LINK } from "../../lib/fileLink";
import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { parseLimit, parsePage } from "../../lib/parse";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid } from "../../lib/validate";
import { type AdminSession, hasSession } from "../../middlewares/adminGuard";
import { prisma } from "../../plugins/prisma";
import {
  parsePublicationCreate,
  parsePublicationPatch,
  PUBLICATION_ORDER,
  publicationFilters,
  serializePublication,
  serializePublicPublication,
  WITH_FILE,
} from "./service";

const FILE_GONE = "fileId no longer exists";

export async function handlePublications(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (parts[0] !== "api" || parts[2] !== "publications") return false;

  if (parts[1] === "public") {
    if (req.method !== "GET" || parts.length !== 3) return false;
    const where: Prisma.PublicationWhereInput = { ...publicationFilters(url, false), status: "PUBLISHED", ...HAS_LINK };
    const limit = parseLimit(url.searchParams.get("limit"), 12, 50);
    const page = parsePage(url.searchParams.get("page"));
    const [total, rows] = await Promise.all([
      prisma.publication.count({ where }),
      prisma.publication.findMany({
        where, include: WITH_FILE, orderBy: PUBLICATION_ORDER, take: limit, skip: (page - 1) * limit,
      }),
    ]);
    const items = rows.flatMap((row) => serializePublicPublication(row) ?? []);
    json(res, 200, { items, page, limit, total });
    return true;
  }
  if (parts[1] !== "admin") return false;
  if (!hasSession(res, session)) return true;

  if (parts.length === 3 && req.method === "GET") {
    const where = publicationFilters(url, true);
    const limit = parseLimit(url.searchParams.get("limit"), 20, 100);
    const page = parsePage(url.searchParams.get("page"));
    const [total, rows] = await Promise.all([
      prisma.publication.count({ where }),
      prisma.publication.findMany({
        where, include: WITH_FILE, orderBy: PUBLICATION_ORDER, take: limit, skip: (page - 1) * limit,
      }),
    ]);
    json(res, 200, { items: rows.map(serializePublication), page, limit, total });
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const input = parsePublicationCreate(asObject(await readJson(req)));
    await assertPdf(input.fileId);
    try {
      const created = await prisma.publication.create({
        data: { ...input, publishedAt: input.status === "PUBLISHED" ? new Date() : null },
        include: WITH_FILE,
      });
      json(res, 201, serializePublication(created));
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
      const { count } = await prisma.publication.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    if (req.method === "GET") {
      const pub = await prisma.publication.findUnique({ where: { id }, include: WITH_FILE });
      if (pub) json(res, 200, serializePublication(pub));
      else notFound(res);
      return true;
    }

    if (req.method === "PATCH") {
      const { fileId, externalUrl, ...rest } = parsePublicationPatch(asObject(await readJson(req)));
      await assertPdf(fileId);
      try {
        const updated = await prisma.$transaction(async (tx) => {
          // The first UPDATE locks the row: concurrent PATCHes serialise, and a concurrent delete ends in P2025 (404).
          // Only then the row is read, so "exactly one of file and link" is checked on what is really stored.
          await tx.publication.update({ where: { id }, data: { updatedAt: new Date() } });
          const current = await tx.publication.findUniqueOrThrow({ where: { id } });
          const nextFile = fileId !== undefined ? fileId : current.fileId;
          const nextUrl = externalUrl !== undefined ? externalUrl : current.externalUrl;
          assertOneLink(nextFile, nextUrl);

          const data: Prisma.PublicationUncheckedUpdateInput = { ...rest, fileId: nextFile, externalUrl: nextUrl };
          if (rest.status === "PUBLISHED" && !current.publishedAt) data.publishedAt = new Date();
          return tx.publication.update({ where: { id }, data, include: WITH_FILE });
        });
        json(res, 200, serializePublication(updated));
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
