import type { HomeBlock, Prisma } from "@prisma/client";

import { parseHref } from "../../lib/href";
import { HttpError, httpError } from "../../lib/httpErrors";
import { isUuid, optString, reqString } from "../../lib/validate";
import { prisma } from "../../plugins/prisma";
import { findAllowedType, serializeMedia } from "../media/service";
import type {
  CtaContent,
  FeaturedContent,
  FeaturedStoredContent,
  FeaturedStoredItem,
  HeroContent,
  HomeBlockAdmin,
  HomeBlockContent,
  HomeBlockPublic,
  HomeBlockTypeValue,
  HomeCta,
  HomeImage,
  StoredContent,
  TickerContent,
  TickerItem,
} from "./dto";

type Obj = Record<string, unknown>;

export const HERO_TITLE_MAX = 200;
export const HERO_TEXT_MAX = 600;
export const CTA_TITLE_MAX = 200;
export const CTA_TEXT_MAX = 400;
export const LABEL_MAX = 60;
export const TICKER_TEXT_MAX = 160;
export const TICKER_ITEMS_MAX = 10;
export const FEATURED_TITLE_MAX = 120;
export const FEATURED_ITEMS_MAX = 6;
export const CARD_TITLE_MAX = 160;
export const CARD_TEXT_MAX = 300;

/** Blocks are read by position; two blocks with the same position (simultaneous creations) keep a stable order. */
export const BLOCK_ORDER: Prisma.HomeBlockOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

// ---------------------------------------------------------------------------------------------------------------
// Validation of what a client sends. Everything below iterates over the known keys of each type: a key sent by the
// client is only ever compared with that list, never used to look something up.
// ---------------------------------------------------------------------------------------------------------------

/** Runs `fn` and puts `path` in front of the message of a 400 it throws: "text is required" becomes "items[0].text is required". */
function inPath<T>(path: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpError && err.status === 400) throw httpError(400, `${path}.${err.message}`);
    throw err;
  }
}

function plainObject(value: unknown, name: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, `${name} must be an object`);
  return value as Obj;
}

/** Rejects (400, naming the key) every own key of `o` that is not in `allowed`. */
export function assertOnlyKeys(o: Obj, allowed: readonly string[]): void {
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key)) throw httpError(400, `${key} is not allowed`);
  }
}

function parseCtaField(o: Obj, key: string, required: boolean): HomeCta | null {
  const raw = o[key];
  if (raw === undefined || raw === null) {
    if (required) throw httpError(400, `${key} is required`);
    return null;
  }
  const cta = plainObject(raw, key);
  return inPath(key, () => {
    assertOnlyKeys(cta, ["label", "href"]);
    return { label: reqString(cta, "label", LABEL_MAX), href: parseHref(cta.href, "href") };
  });
}

/** A link that may be left out: absent, null and an empty string all mean "no link". */
function optHref(o: Obj, key: string): string | null {
  const raw = o[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  return parseHref(raw, key);
}

function optImageId(o: Obj): string | null {
  const raw = o.imageId;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw httpError(400, "imageId must be a uuid");
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!isUuid(trimmed)) throw httpError(400, "imageId must be a uuid");
  return trimmed.toLowerCase();
}

function parseItems<T>(o: Obj, max: number, parseItem: (item: Obj) => T): T[] {
  const raw = o.items;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > max) {
    throw httpError(400, `items must be a list of 1 to ${max} items`);
  }
  return raw.map((entry, index) => {
    const name = `items[${index}]`;
    const item = plainObject(entry, name);
    return inPath(name, () => parseItem(item));
  });
}

function parseHero(o: Obj): HeroContent {
  assertOnlyKeys(o, ["title", "text", "primaryCta", "secondaryCta"]);
  return {
    title: reqString(o, "title", HERO_TITLE_MAX),
    text: optString(o, "text", HERO_TEXT_MAX) ?? null,
    primaryCta: parseCtaField(o, "primaryCta", true) as HomeCta,
    secondaryCta: parseCtaField(o, "secondaryCta", false),
  };
}

function parseTicker(o: Obj): TickerContent {
  assertOnlyKeys(o, ["items"]);
  return {
    items: parseItems(o, TICKER_ITEMS_MAX, (item): TickerItem => {
      assertOnlyKeys(item, ["text", "href"]);
      return { text: reqString(item, "text", TICKER_TEXT_MAX), href: optHref(item, "href") };
    }),
  };
}

function parseCta(o: Obj): CtaContent {
  assertOnlyKeys(o, ["title", "text", "cta"]);
  return {
    title: reqString(o, "title", CTA_TITLE_MAX),
    text: optString(o, "text", CTA_TEXT_MAX) ?? null,
    cta: parseCtaField(o, "cta", true) as HomeCta,
  };
}

function parseFeatured(o: Obj): FeaturedStoredContent {
  assertOnlyKeys(o, ["title", "items"]);
  return {
    title: reqString(o, "title", FEATURED_TITLE_MAX),
    items: parseItems(o, FEATURED_ITEMS_MAX, (item): FeaturedStoredItem => {
      assertOnlyKeys(item, ["title", "text", "href", "imageId"]);
      return {
        title: reqString(item, "title", CARD_TITLE_MAX),
        text: optString(item, "text", CARD_TEXT_MAX) ?? null,
        href: parseHref(item.href, "href"),
        imageId: optImageId(item),
      };
    }),
  };
}

/**
 * Validates the `content` sent for a block of the given type and returns what is stored: trimmed strings, optional
 * parts as null, links normalised. Unknown keys and the fields of other types are a 400 that names the key.
 */
export function parseHomeContent(type: HomeBlockTypeValue, value: unknown): StoredContent {
  if (value === undefined) throw httpError(400, "content is required");
  const content = plainObject(value, "content");

  return inPath("content", () => {
    switch (type) {
      case "HERO":
        return parseHero(content);
      case "TICKER":
        return parseTicker(content);
      case "CTA":
        return parseCta(content);
      case "FEATURED":
        return parseFeatured(content);
    }
  });
}

/** The ids of a reorder request: a list of uuids without repetitions. */
export function parseOrderIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isUuid)) throw httpError(400, "ids must be a list of uuids");
  if (new Set(value).size !== value.length) throw httpError(400, "ids must not contain duplicates");
  return value;
}

/** Every image of a FEATURED block must be an existing media row of an image type (not a PDF). */
export async function assertImagesUsable(type: HomeBlockTypeValue, content: StoredContent): Promise<void> {
  if (type !== "FEATURED") return;
  const items = (content as FeaturedStoredContent).items;
  const wanted = [...new Set(items.flatMap((item) => (item.imageId ? [item.imageId] : [])))];
  if (!wanted.length) return;

  const rows = await prisma.media.findMany({ where: { id: { in: wanted } }, select: { id: true, mimeType: true } });
  const mimeTypes = new Map(rows.map((row) => [row.id, row.mimeType]));

  items.forEach((item, index) => {
    if (!item.imageId) return;
    const mimeType = mimeTypes.get(item.imageId);
    if (mimeType === undefined) {
      throw httpError(400, `content.items[${index}].imageId does not match an existing media`);
    }
    if (!findAllowedType(mimeType)?.image) {
      throw httpError(400, `content.items[${index}].imageId must be an image`);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

export function listBlocks(where?: Prisma.HomeBlockWhereInput): Promise<HomeBlock[]> {
  return prisma.homeBlock.findMany({ where, orderBy: BLOCK_ORDER });
}

/** The position a new block takes: after the last one. Simultaneous creations may tie, BLOCK_ORDER breaks the tie. */
export async function nextPosition(): Promise<number> {
  const last = await prisma.homeBlock.aggregate({ _max: { position: true } });
  return (last._max.position ?? -1) + 1;
}

function storedItems(row: Pick<HomeBlock, "type" | "content">): FeaturedStoredItem[] {
  return row.type === "FEATURED" ? (row.content as unknown as FeaturedStoredContent).items : [];
}

/** Resolves the images of all the given blocks with a single query (none when no card has an image). */
export async function loadImages(rows: Pick<HomeBlock, "type" | "content">[]): Promise<Map<string, HomeImage>> {
  const ids = [...new Set(rows.flatMap((row) => storedItems(row).flatMap((item) => (item.imageId ? [item.imageId] : []))))];
  const images = new Map<string, HomeImage>();
  if (!ids.length) return images;

  for (const media of await prisma.media.findMany({ where: { id: { in: ids } } })) {
    images.set(media.id, { id: media.id, url: serializeMedia(media).url, alt: media.alt });
  }
  return images;
}

function ctaOf(cta: HomeCta): HomeCta {
  return { label: cta.label, href: cta.href };
}

/** Builds the served content field by field, so nothing that is stored but not meant to be served can leak. */
export function serializeContent(
  type: HomeBlockTypeValue,
  stored: unknown,
  images: Map<string, HomeImage>,
): HomeBlockContent {
  switch (type) {
    case "HERO": {
      const content = stored as HeroContent;
      return {
        title: content.title,
        text: content.text ?? null,
        primaryCta: ctaOf(content.primaryCta),
        secondaryCta: content.secondaryCta ? ctaOf(content.secondaryCta) : null,
      };
    }
    case "TICKER": {
      const content = stored as TickerContent;
      return { items: content.items.map((item) => ({ text: item.text, href: item.href ?? null })) };
    }
    case "CTA": {
      const content = stored as CtaContent;
      return { title: content.title, text: content.text ?? null, cta: ctaOf(content.cta) };
    }
    case "FEATURED": {
      const content = stored as FeaturedStoredContent;
      const served: FeaturedContent = {
        title: content.title,
        items: content.items.map((item) => ({
          title: item.title,
          text: item.text ?? null,
          href: item.href,
          // A media that was deleted after the card was saved is simply not there any more.
          image: (item.imageId ? images.get(item.imageId) : undefined) ?? null,
        })),
      };
      return served;
    }
  }
}

export function serializePublic(row: HomeBlock, images: Map<string, HomeImage>): HomeBlockPublic {
  return { id: row.id, type: row.type, content: serializeContent(row.type, row.content, images) };
}

export function serializeAdmin(row: HomeBlock, images: Map<string, HomeImage>): HomeBlockAdmin {
  return {
    id: row.id,
    type: row.type,
    position: row.position,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    content: serializeContent(row.type, row.content, images),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------------------------------------------

/**
 * Gives the blocks the positions 0, 1, 2... in the order of `ids`, in one transaction.
 *
 * `ids` must be exactly the set of the existing blocks (400 otherwise; the existing ones are read inside the
 * transaction). A block deleted between that read and its update makes the whole reorder fail with 409 and nothing is
 * written. A block created in the meantime is not an error: it was not part of the request and stays after the others.
 * The rows are written in ascending id order, so two reorders racing each other lock them in the same order.
 */
export async function reorderBlocks(ids: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.homeBlock.findMany({ select: { id: true } });
    const known = new Set(existing.map((row) => row.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw httpError(400, "ids must list every existing block exactly once");
    }

    const positions = ids.map((id, position) => ({ id, position })).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const { id, position } of positions) {
      const { count } = await tx.homeBlock.updateMany({ where: { id }, data: { position } });
      if (count === 0) throw httpError(409, "a block was deleted while the order was being saved: reload the list");
    }
  });
}
