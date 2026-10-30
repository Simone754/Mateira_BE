import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { assertOneLink, HAS_LINK, type LinkFields, parseLinkFields, publicLink, serializeFile } from "../../lib/fileLink";
import { httpError } from "../../lib/httpErrors";
import { assertOnlyKeys, optDate, optEnum, optLine, optText, reqDate, reqEnum, reqLine, reqText, toUtcDay } from "../../lib/validate";
import { prisma } from "../../plugins/prisma";
import { CONTENT_STATUSES, type ContentStatusValue } from "../organs/dto";
import { DOCUMENT_CATEGORIES, type DocumentAdmin, type DocumentCategoryValue, type DocumentPublic } from "./dto";

type Obj = Record<string, unknown>;

export const DOCUMENT_TITLE_MAX = 200;
export const DOCUMENT_SECTION_MAX = 120;
export const DOCUMENT_DESCRIPTION_MAX = 1000;

const DOCUMENT_KEYS = [
  "title", "category", "section", "date", "description", "fileId", "externalUrl", "status",
] as const;

export const WITH_FILE = { file: true } satisfies Prisma.DocumentInclude;
export type DocumentWithFile = Prisma.DocumentGetPayload<{ include: typeof WITH_FILE }>;

export type DocumentCreateInput = {
  title: string;
  category: DocumentCategoryValue;
  section: string | null;
  date: Date;
  description: string | null;
  fileId: string | null;
  externalUrl: string | null;
  status: ContentStatusValue;
};

export type DocumentPatchInput = LinkFields & {
  title?: string;
  category?: DocumentCategoryValue;
  section?: string | null;
  date?: Date;
  description?: string | null;
  status?: ContentStatusValue;
};

export function parseDocumentCreate(o: Obj): DocumentCreateInput {
  assertOnlyKeys(o, DOCUMENT_KEYS);
  const link = parseLinkFields(o);
  const fileId = link.fileId ?? null;
  const externalUrl = link.externalUrl ?? null;
  const input: DocumentCreateInput = {
    title: reqLine(o, "title", DOCUMENT_TITLE_MAX),
    category: reqEnum(o, "category", DOCUMENT_CATEGORIES),
    section: optLine(o, "section", DOCUMENT_SECTION_MAX) ?? null,
    date: toUtcDay(reqDate(o, "date")),
    description: optText(o, "description", DOCUMENT_DESCRIPTION_MAX) ?? null,
    fileId,
    externalUrl,
    status: optEnum(o, "status", CONTENT_STATUSES) ?? "DRAFT",
  };
  assertOneLink(fileId, externalUrl);
  return input;
}

export function parseDocumentPatch(o: Obj): DocumentPatchInput {
  assertOnlyKeys(o, DOCUMENT_KEYS);
  if (Object.keys(o).length === 0) throw httpError(400, "nothing to change");

  const patch: DocumentPatchInput = { ...parseLinkFields(o) };
  if (Object.hasOwn(o, "title")) patch.title = reqLine(o, "title", DOCUMENT_TITLE_MAX);
  if (Object.hasOwn(o, "category")) patch.category = reqEnum(o, "category", DOCUMENT_CATEGORIES);
  const section = optLine(o, "section", DOCUMENT_SECTION_MAX);
  if (section !== undefined) patch.section = section;
  const date = optDate(o, "date");
  if (date !== undefined) patch.date = toUtcDay(date);
  const description = optText(o, "description", DOCUMENT_DESCRIPTION_MAX);
  if (description !== undefined) patch.description = description;
  const status = optEnum(o, "status", CONTENT_STATUSES);
  if (status !== undefined) patch.status = status;
  return patch;
}

/** `category` and `status` filters of the admin list: absent means no filter, empty or unknown is a 400. */
export function documentFilters(url: URL): Prisma.DocumentWhereInput {
  const params = Object.fromEntries(url.searchParams);
  const category = optEnum(params, "category", DOCUMENT_CATEGORIES);
  const status = optEnum(params, "status", CONTENT_STATUSES);
  return { ...(category ? { category } : {}), ...(status ? { status } : {}) };
}

/** The `category` of the public list: required, INSTITUTIONAL or TRANSPARENCY. */
export function publicCategoryFilter(url: URL): DocumentCategoryValue {
  const category = optEnum(Object.fromEntries(url.searchParams), "category", DOCUMENT_CATEGORIES);
  if (!category) throw httpError(400, `category is required: ${DOCUMENT_CATEGORIES.join(", ")}`);
  return category;
}

const LIST_ORDER: Prisma.DocumentOrderByWithRelationInput[] = [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }];

/** The documents that match, newest first. */
export async function listAdminDocuments(where: Prisma.DocumentWhereInput): Promise<DocumentWithFile[]> {
  return prisma.document.findMany({ where, include: WITH_FILE, orderBy: LIST_ORDER });
}

/** The published documents of the category that have a link: by section (case-insensitive, none last), date (newest first), creation date, id. */
export async function listPublicDocuments(category: DocumentCategoryValue): Promise<DocumentPublic[]> {
  const rows = await prisma.document.findMany({
    where: { category, status: "PUBLISHED", ...HAS_LINK },
    include: WITH_FILE,
    orderBy: [{ date: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  // sort is stable: inside a section the query order (date, createdAt, id) stays.
  const sorted = rows.sort((a, b) => {
    if (a.section === null || b.section === null) return (a.section === null ? 1 : 0) - (b.section === null ? 1 : 0);
    return a.section.localeCompare(b.section, "it", { sensitivity: "base" });
  });
  return sorted.flatMap((d) => {
    const link = publicLink(d);
    return link
      ? [{ id: d.id, title: d.title, section: d.section, date: d.date.toISOString(), description: d.description, link }]
      : [];
  });
}

export function serializeDocument(doc: DocumentWithFile): DocumentAdmin {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    section: doc.section,
    date: doc.date.toISOString(),
    description: doc.description,
    file: serializeFile(doc.file),
    externalUrl: doc.externalUrl,
    status: doc.status,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
