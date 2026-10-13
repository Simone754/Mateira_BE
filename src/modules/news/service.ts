import { Prisma } from "@prisma/client";
import type { Media, News } from "@prisma/client";

import { httpError } from "../../lib/httpErrors";
import { slugify } from "../../lib/slug";
import {
  optDate,
  optEnum,
  optString,
  optUuid,
  optUuidList,
  reqDate,
  reqEnum,
  reqString,
} from "../../lib/validate";
import { prisma } from "../../plugins/prisma";
import { serializeMedia } from "../media/service";
import {
  CONTENT_STATUSES,
  ContentStatusValue,
  ExternalLink,
  MediaRef,
  NEWS_CATEGORIES,
  NewsAdmin,
  NewsCategoryValue,
  NewsPublicDetail,
  NewsPublicListItem,
} from "./dto";

type Obj = Record<string, unknown>;

export const NEWS_INCLUDE = { image: true, attachments: true } as const;
export type NewsWithMedia = News & { image: Media | null; attachments: Media[] };

const TITLE_MAX = 200;
const BODY_MAX = 50_000;
const LINKS_MAX = 10;
const EXCERPT_LENGTH = 220;

/** How many times a write is retried when a concurrent request takes the slug first. */
export const SLUG_ATTEMPTS = 10;

export function parseExternalLinks(value: unknown): ExternalLink[] {
  if (!Array.isArray(value) || value.length > LINKS_MAX) {
    throw httpError(400, `externalLinks must be a list of at most ${LINKS_MAX} items`);
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") throw httpError(400, "externalLinks items must be objects");
    const { label, url } = item as Obj;
    if (typeof label !== "string" || !label.trim() || label.trim().length > 120) {
      throw httpError(400, "externalLinks label is required (max 120)");
    }
    if (typeof url !== "string" || url.length > 500) throw httpError(400, "externalLinks url is not valid");

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw httpError(400, "externalLinks url is not valid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw httpError(400, "externalLinks url must be http or https");
    }
    return { label: label.trim(), url: parsed.toString() };
  });
}

export type NewsCreateInput = {
  title: string;
  slug: string | null;
  date: Date;
  category: NewsCategoryValue;
  body: string;
  author: string | null;
  externalLinks: ExternalLink[];
  imageId: string | null;
  attachmentIds: string[];
  status: ContentStatusValue;
};

export function parseNewsCreate(o: Obj): NewsCreateInput {
  return {
    title: reqString(o, "title", TITLE_MAX),
    slug: optString(o, "slug", 100) ?? null,
    date: reqDate(o, "date"),
    category: reqEnum(o, "category", NEWS_CATEGORIES),
    body: reqString(o, "body", BODY_MAX),
    author: optString(o, "author", 120) ?? null,
    externalLinks: "externalLinks" in o ? parseExternalLinks(o.externalLinks) : [],
    imageId: optUuid(o, "imageId") ?? null,
    attachmentIds: optUuidList(o, "attachmentIds") ?? [],
    status: optEnum(o, "status", CONTENT_STATUSES) ?? "DRAFT",
  };
}

export type NewsPatchInput = Partial<Omit<NewsCreateInput, "imageId" | "slug">> & {
  imageId?: string | null;
  slug?: string | null;
};

export function parseNewsPatch(o: Obj): NewsPatchInput {
  const patch: NewsPatchInput = {};

  if ("title" in o) patch.title = reqString(o, "title", TITLE_MAX);
  if ("slug" in o) patch.slug = optString(o, "slug", 100) ?? null;
  if ("date" in o) patch.date = optDate(o, "date");
  if ("category" in o) patch.category = optEnum(o, "category", NEWS_CATEGORIES);
  if ("body" in o) patch.body = reqString(o, "body", BODY_MAX);
  if ("author" in o) patch.author = optString(o, "author", 120) ?? null;
  if ("externalLinks" in o) patch.externalLinks = parseExternalLinks(o.externalLinks);
  if ("imageId" in o) patch.imageId = optUuid(o, "imageId");
  if ("attachmentIds" in o) patch.attachmentIds = optUuidList(o, "attachmentIds") ?? [];
  if ("status" in o) patch.status = optEnum(o, "status", CONTENT_STATUSES);

  return patch;
}

export async function assertMediaExists(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const found = await prisma.media.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw httpError(400, "image or attachment not found");
}

export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const taken = await prisma.news.findFirst({
      where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw httpError(409, "could not generate a unique slug");
}

export function toJsonLinks(links: ExternalLink[]): Prisma.InputJsonValue {
  return links as unknown as Prisma.InputJsonValue;
}

function mediaRef(media: Media): MediaRef {
  const { id, url, mimeType, alt } = serializeMedia(media);
  return { id, url, mimeType, alt };
}

function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT_LENGTH ? flat : `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}

export function serializePublicListItem(news: NewsWithMedia): NewsPublicListItem {
  return {
    slug: news.slug,
    title: news.title,
    date: news.date.toISOString(),
    category: news.category,
    excerpt: excerptOf(news.body),
    author: news.author,
    image: news.image ? mediaRef(news.image) : null,
    publishedAt: news.publishedAt ? news.publishedAt.toISOString() : null,
  };
}

export function serializePublicDetail(news: NewsWithMedia): NewsPublicDetail {
  return {
    ...serializePublicListItem(news),
    body: news.body,
    attachments: news.attachments.map(mediaRef),
    externalLinks: (news.externalLinks ?? []) as unknown as ExternalLink[],
  };
}

export function serializeAdmin(news: NewsWithMedia): NewsAdmin {
  return {
    ...serializePublicDetail(news),
    id: news.id,
    status: news.status,
    createdAt: news.createdAt.toISOString(),
    updatedAt: news.updatedAt.toISOString(),
  };
}
