import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { parseLimit, parsePage } from "../../lib/parse";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid, optEnum } from "../../lib/validate";
import { type AdminSession, hasSession } from "../../middlewares/adminGuard";
import { prisma } from "../../plugins/prisma";
import { CONTENT_STATUSES, NEWS_CATEGORIES } from "./dto";
import {
  assertMediaExists,
  NEWS_INCLUDE,
  NewsWithMedia,
  parseNewsCreate,
  parseNewsPatch,
  serializeAdmin,
  serializePublicDetail,
  serializePublicListItem,
  SLUG_ATTEMPTS,
  toJsonLinks,
  uniqueSlug,
} from "./service";

const ORDER: Prisma.NewsOrderByWithRelationInput[] = [{ date: "desc" }, { id: "desc" }];

/**
 * Applies an update, retrying with a fresh slug when a concurrent request takes it first.
 * Returns null when the news has been deleted in the meantime.
 */
async function updateNews(
  id: string,
  data: Prisma.NewsUpdateInput,
  slugBase: string | null | undefined,
): Promise<NewsWithMedia | null> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    if (slugBase) data.slug = await uniqueSlug(slugBase, id);
    try {
      return await prisma.news.update({ where: { id }, data, include: NEWS_INCLUDE });
    } catch (err) {
      if (isPrismaError(err, "P2025")) {
        const stillThere = await prisma.news.findUnique({ where: { id }, select: { id: true } });
        if (!stillThere) return null;
        throw httpError(400, "image or attachment not found");
      }
      if (!slugBase || !isPrismaError(err, "P2002")) throw err;
    }
  }
  throw httpError(409, "could not generate a unique slug");
}

export async function handleNews(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (parts[0] !== "api" || parts[2] !== "news") return false;

  if (parts[1] === "public") return handlePublic(req, res, url, parts);
  if (parts[1] === "admin") return handleAdmin(req, res, url, parts, session);
  return false;
}

async function handlePublic(req: IncomingMessage, res: ServerResponse, url: URL, parts: string[]): Promise<boolean> {
  if (req.method !== "GET") return false;

  if (parts.length === 3) {
    const query = Object.fromEntries(url.searchParams);
    const category = optEnum(query, "category", NEWS_CATEGORIES);
    const limit = parseLimit(url.searchParams.get("limit"), 12, 50);
    const page = parsePage(url.searchParams.get("page"));
    const where: Prisma.NewsWhereInput = { status: "PUBLISHED", ...(category ? { category } : {}) };

    const [total, rows] = await Promise.all([
      prisma.news.count({ where }),
      prisma.news.findMany({ where, include: NEWS_INCLUDE, orderBy: ORDER, take: limit, skip: (page - 1) * limit }),
    ]);
    json(res, 200, { items: rows.map(serializePublicListItem), page, limit, total });
    return true;
  }

  if (parts.length === 4) {
    const news = await prisma.news.findFirst({
      where: { slug: parts[3], status: "PUBLISHED" },
      include: NEWS_INCLUDE,
    });
    if (!news) {
      notFound(res);
      return true;
    }
    json(res, 200, serializePublicDetail(news));
    return true;
  }

  return false;
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
    const query = Object.fromEntries(url.searchParams);
    const status = optEnum(query, "status", CONTENT_STATUSES);
    const category = optEnum(query, "category", NEWS_CATEGORIES);
    const limit = parseLimit(url.searchParams.get("limit"), 20, 100);
    const page = parsePage(url.searchParams.get("page"));
    const where: Prisma.NewsWhereInput = { ...(status ? { status } : {}), ...(category ? { category } : {}) };

    const [total, rows] = await Promise.all([
      prisma.news.count({ where }),
      prisma.news.findMany({ where, include: NEWS_INCLUDE, orderBy: ORDER, take: limit, skip: (page - 1) * limit }),
    ]);
    json(res, 200, { items: rows.map(serializeAdmin), page, limit, total });
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const input = parseNewsCreate(asObject(await readJson(req)));
    await assertMediaExists([...(input.imageId ? [input.imageId] : []), ...input.attachmentIds]);

    let created: NewsWithMedia | null = null;
    for (let attempt = 0; attempt < SLUG_ATTEMPTS && !created; attempt++) {
      const slug = await uniqueSlug(input.slug ?? input.title);
      try {
        created = await prisma.news.create({
          data: {
            slug,
            title: input.title,
            date: input.date,
            category: input.category,
            body: input.body,
            author: input.author,
            externalLinks: toJsonLinks(input.externalLinks),
            status: input.status,
            publishedAt: input.status === "PUBLISHED" ? new Date() : null,
            image: input.imageId ? { connect: { id: input.imageId } } : undefined,
            attachments: { connect: input.attachmentIds.map((id) => ({ id })) },
          },
          include: NEWS_INCLUDE,
        });
      } catch (err) {
        // A media row vanished between the check and the connect.
        if (isPrismaError(err, "P2025")) throw httpError(400, "image or attachment not found");
        // A concurrent request took the slug first: compute it again.
        if (!isPrismaError(err, "P2002")) throw err;
      }
    }
    if (!created) throw httpError(409, "could not generate a unique slug");

    json(res, 201, serializeAdmin(created));
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];

    if (req.method === "DELETE") {
      const { count } = await prisma.news.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    const existing = await prisma.news.findUnique({ where: { id }, include: NEWS_INCLUDE });
    if (!existing) {
      notFound(res);
      return true;
    }

    if (req.method === "GET") {
      json(res, 200, serializeAdmin(existing));
      return true;
    }

    if (req.method === "PATCH") {
      const patch = parseNewsPatch(asObject(await readJson(req)));
      await assertMediaExists([...(patch.imageId ? [patch.imageId] : []), ...(patch.attachmentIds ?? [])]);

      const data: Prisma.NewsUpdateInput = {};
      if (patch.title !== undefined) data.title = patch.title;
      if (patch.date !== undefined) data.date = patch.date;
      if (patch.category !== undefined) data.category = patch.category;
      if (patch.body !== undefined) data.body = patch.body;
      if (patch.author !== undefined) data.author = patch.author;
      if (patch.externalLinks !== undefined) data.externalLinks = toJsonLinks(patch.externalLinks);
      if (patch.imageId !== undefined) {
        data.image = patch.imageId ? { connect: { id: patch.imageId } } : { disconnect: true };
      }
      if (patch.attachmentIds !== undefined) {
        data.attachments = { set: patch.attachmentIds.map((attachmentId) => ({ id: attachmentId })) };
      }
      if (patch.status !== undefined) {
        data.status = patch.status;
        if (patch.status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
      }

      const updated = await updateNews(id, data, patch.slug);
      if (!updated) {
        notFound(res);
        return true;
      }
      json(res, 200, serializeAdmin(updated));
      return true;
    }
  }

  return false;
}
