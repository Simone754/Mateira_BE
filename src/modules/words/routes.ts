import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma, Word } from "@prisma/client";

import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid } from "../../lib/validate";
import { type AdminSession, hasSession } from "../../middlewares/adminGuard";
import { prisma } from "../../plugins/prisma";
import {
  DUPLICATE_WORD,
  listWords,
  nextPosition,
  pageFilter,
  parseWordCreate,
  parseWordPatch,
  serializeAdmin,
  serializePublic,
} from "./service";

export async function handleWords(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (parts[0] !== "api" || parts[2] !== "words") return false;

  if (parts[1] === "public") return handlePublic(req, res, url, parts);
  if (parts[1] === "admin") return handleAdmin(req, res, url, parts, session);
  return false;
}

async function handlePublic(req: IncomingMessage, res: ServerResponse, url: URL, parts: string[]): Promise<boolean> {
  if (req.method !== "GET" || parts.length !== 3) return false;

  const page = pageFilter(url);
  const rows = await listWords({ status: "PUBLISHED", ...(page ? { page } : {}) });
  json(res, 200, { words: rows.map(serializePublic) });
  return true;
}

async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (!hasSession(res, session)) return true;

  if (parts.length === 3 && req.method === "GET") {
    const page = pageFilter(url);
    const rows = await listWords(page ? { page } : {});
    json(res, 200, { words: rows.map(serializeAdmin) });
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const input = parseWordCreate(asObject(await readJson(req)));
    let created: Word;
    try {
      created = await prisma.word.create({
        data: {
          term: input.term,
          etymology: input.etymology,
          meaning: input.meaning,
          closing: input.closing,
          page: input.page,
          position: input.position ?? (await nextPosition(input.page)),
          status: input.status,
          publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        },
      });
    } catch (err) {
      // The same term on the same page, also when a concurrent request created it a moment ago.
      if (isPrismaError(err, "P2002")) throw httpError(409, DUPLICATE_WORD);
      throw err;
    }
    json(res, 201, serializeAdmin(created));
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];

    if (req.method === "DELETE") {
      // deleteMany does not throw when a concurrent request got there first: only one request sees count 1.
      const { count } = await prisma.word.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    const existing = await prisma.word.findUnique({ where: { id } });
    if (!existing) {
      notFound(res);
      return true;
    }

    if (req.method === "GET") {
      json(res, 200, serializeAdmin(existing));
      return true;
    }

    if (req.method === "PATCH") {
      const patch = parseWordPatch(asObject(await readJson(req)));

      const data: Prisma.WordUpdateInput = {};
      if (patch.term !== undefined) data.term = patch.term;
      if (patch.etymology !== undefined) data.etymology = patch.etymology;
      if (patch.meaning !== undefined) data.meaning = patch.meaning;
      if (patch.closing !== undefined) data.closing = patch.closing;
      if (patch.page !== undefined) data.page = patch.page;
      if (patch.position !== undefined) data.position = patch.position;
      else if (patch.page !== undefined && patch.page !== existing.page) data.position = await nextPosition(patch.page);
      if (patch.status !== undefined) {
        data.status = patch.status;
        if (patch.status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
      }

      let updated: Word;
      try {
        updated = await prisma.word.update({ where: { id }, data });
      } catch (err) {
        // A concurrent request deleted the word after the lookup above.
        if (isPrismaError(err, "P2025")) {
          notFound(res);
          return true;
        }
        if (isPrismaError(err, "P2002")) throw httpError(409, DUPLICATE_WORD);
        throw err;
      }
      json(res, 200, serializeAdmin(updated));
      return true;
    }
  }

  return false;
}
