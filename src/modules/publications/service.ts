import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { assertOneLink, type LinkFields, parseLinkFields, publicLink, serializeFile } from "../../lib/fileLink";
import { httpError } from "../../lib/httpErrors";
import { assertOnlyKeys, optDate, optEnum, optLine, optText, reqDate, reqEnum, reqLine, toUtcDay } from "../../lib/validate";
import { CONTENT_STATUSES, type ContentStatusValue } from "../organs/dto";
import { PUBLICATION_TYPES, PUBLICATION_TITLE_MAX, PUBLICATION_AUTHORS_MAX, PUBLICATION_ABSTRACT_MAX, type PublicationAdmin, type PublicationPublic, type PublicationTypeValue } from "./dto";

export { PUBLICATION_TITLE_MAX, PUBLICATION_AUTHORS_MAX, PUBLICATION_ABSTRACT_MAX } from "./dto";

type Obj = Record<string, unknown>;


const PUBLICATION_KEYS = [
  "title", "type", "authors", "date", "abstract", "fileId", "externalUrl", "status",
] as const;

export const WITH_FILE = { file: true } satisfies Prisma.PublicationInclude;
export type PublicationWithFile = Prisma.PublicationGetPayload<{ include: typeof WITH_FILE }>;

/** Newest first; same day: first created first, then id. */
export const PUBLICATION_ORDER: Prisma.PublicationOrderByWithRelationInput[] = [
  { date: "desc" },
  { createdAt: "asc" },
  { id: "asc" },
];

export type PublicationCreateInput = {
  title: string;
  type: PublicationTypeValue;
  authors: string | null;
  date: Date;
  abstract: string | null;
  fileId: string | null;
  externalUrl: string | null;
  status: ContentStatusValue;
};

export type PublicationPatchInput = LinkFields & {
  title?: string;
  type?: PublicationTypeValue;
  authors?: string | null;
  date?: Date;
  abstract?: string | null;
  status?: ContentStatusValue;
};

export function parsePublicationCreate(o: Obj): PublicationCreateInput {
  assertOnlyKeys(o, PUBLICATION_KEYS);
  const link = parseLinkFields(o);
  const fileId = link.fileId ?? null;
  const externalUrl = link.externalUrl ?? null;
  const input: PublicationCreateInput = {
    title: reqLine(o, "title", PUBLICATION_TITLE_MAX),
    type: reqEnum(o, "type", PUBLICATION_TYPES),
    authors: optLine(o, "authors", PUBLICATION_AUTHORS_MAX) ?? null,
    date: toUtcDay(reqDate(o, "date")),
    abstract: optText(o, "abstract", PUBLICATION_ABSTRACT_MAX) ?? null,
    fileId,
    externalUrl,
    status: optEnum(o, "status", CONTENT_STATUSES) ?? "DRAFT",
  };
  assertOneLink(fileId, externalUrl);
  return input;
}

export function parsePublicationPatch(o: Obj): PublicationPatchInput {
  assertOnlyKeys(o, PUBLICATION_KEYS);
  if (Object.keys(o).length === 0) throw httpError(400, "nothing to change");

  const patch: PublicationPatchInput = { ...parseLinkFields(o) };
  if (Object.hasOwn(o, "title")) patch.title = reqLine(o, "title", PUBLICATION_TITLE_MAX);
  if (Object.hasOwn(o, "type")) patch.type = reqEnum(o, "type", PUBLICATION_TYPES);
  const authors = optLine(o, "authors", PUBLICATION_AUTHORS_MAX);
  if (authors !== undefined) patch.authors = authors;
  const date = optDate(o, "date");
  if (date !== undefined) patch.date = toUtcDay(date);
  const abstract = optText(o, "abstract", PUBLICATION_ABSTRACT_MAX);
  if (abstract !== undefined) patch.abstract = abstract;
  const status = optEnum(o, "status", CONTENT_STATUSES);
  if (status !== undefined) patch.status = status;
  return patch;
}

/** `type` (and, in the panel, `status`) filters: absent means no filter, empty or unknown is a 400. */
export function publicationFilters(url: URL, withStatus: boolean): Prisma.PublicationWhereInput {
  const params = Object.fromEntries(url.searchParams);
  const type = optEnum(params, "type", PUBLICATION_TYPES);
  const status = withStatus ? optEnum(params, "status", CONTENT_STATUSES) : undefined;
  return { ...(type ? { type } : {}), ...(status ? { status } : {}) };
}

export function serializePublication(pub: PublicationWithFile): PublicationAdmin {
  return {
    id: pub.id,
    title: pub.title,
    type: pub.type,
    authors: pub.authors,
    date: pub.date.toISOString(),
    abstract: pub.abstract,
    file: serializeFile(pub.file),
    externalUrl: pub.externalUrl,
    status: pub.status,
    publishedAt: pub.publishedAt ? pub.publishedAt.toISOString() : null,
    createdAt: pub.createdAt.toISOString(),
    updatedAt: pub.updatedAt.toISOString(),
  };
}

/** The public form of a publication, or null when it has no link (its file was deleted). */
export function serializePublicPublication(pub: PublicationWithFile): PublicationPublic | null {
  const link = publicLink(pub);
  if (!link) return null;
  return {
    id: pub.id,
    title: pub.title,
    type: pub.type,
    authors: pub.authors,
    date: pub.date.toISOString(),
    abstract: pub.abstract,
    link,
  };
}
