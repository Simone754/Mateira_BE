import { URL } from "node:url";

import type { Prisma, Word } from "@prisma/client";

import { httpError } from "../../lib/httpErrors";
import { assertOnlyKeys, optEnum, optString, reqEnum, reqString } from "../../lib/validate";
import { prisma } from "../../plugins/prisma";
import {
  CONTENT_STATUSES,
  type ContentStatusValue,
  WORD_PAGES,
  type WordAdmin,
  type WordPageValue,
  type WordPublic,
} from "./dto";

type Obj = Record<string, unknown>;

export const TERM_MAX = 60;
export const ETYMOLOGY_MAX = 1000;
export const MEANING_MAX = 3000;
export const CLOSING_MAX = 300;
export const POSITION_MAX = 9999;

export const DUPLICATE_WORD = "a word with this term already exists on this page";

const WORD_KEYS = ["term", "etymology", "meaning", "closing", "page", "position", "status"] as const;

/** Inside a page: by position; two words with the same position keep a stable order. */
export const WORD_ORDER: Prisma.WordOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

export type WordCreateInput = {
  term: string;
  etymology: string;
  meaning: string;
  closing: string | null;
  page: WordPageValue;
  /** undefined: at the end of the page. */
  position: number | undefined;
  status: ContentStatusValue;
};

/** Only the fields that were sent; `closing: null` removes the closing sentence. */
export type WordPatchInput = {
  term?: string;
  etymology?: string;
  meaning?: string;
  closing?: string | null;
  page?: WordPageValue;
  position?: number;
  status?: ContentStatusValue;
};

/** The field with its line ends turned into "\n", so a text typed on Windows is stored and measured like any other. */
function withUnixLineEnds(o: Obj, key: string): Obj {
  if (!Object.hasOwn(o, key)) return {};
  const value = o[key];
  return { [key]: typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value };
}

function reqText(o: Obj, key: string, max: number): string {
  return reqString(withUnixLineEnds(o, key), key, max);
}

function optText(o: Obj, key: string, max: number): string | null | undefined {
  return optString(withUnixLineEnds(o, key), key, max);
}

function parseTerm(o: Obj): string {
  const term = reqString(o, "term", TERM_MAX);
  if (/[\r\n]/.test(term)) throw httpError(400, "term must be a single line");
  return term;
}

function optPosition(o: Obj): number | undefined {
  if (!Object.hasOwn(o, "position")) return undefined;
  const value = o.position;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > POSITION_MAX) {
    throw httpError(400, `position must be an integer from 0 to ${POSITION_MAX}`);
  }
  return value;
}

export function parseWordCreate(o: Obj): WordCreateInput {
  assertOnlyKeys(o, WORD_KEYS);
  return {
    term: parseTerm(o),
    etymology: reqText(o, "etymology", ETYMOLOGY_MAX),
    meaning: reqText(o, "meaning", MEANING_MAX),
    closing: optText(o, "closing", CLOSING_MAX) ?? null,
    page: reqEnum(o, "page", WORD_PAGES),
    position: optPosition(o),
    status: optEnum(o, "status", CONTENT_STATUSES) ?? "DRAFT",
  };
}

export function parseWordPatch(o: Obj): WordPatchInput {
  assertOnlyKeys(o, WORD_KEYS);
  if (Object.keys(o).length === 0) throw httpError(400, "nothing to change");

  const patch: WordPatchInput = {};
  if (Object.hasOwn(o, "term")) patch.term = parseTerm(o);
  if (Object.hasOwn(o, "etymology")) patch.etymology = reqText(o, "etymology", ETYMOLOGY_MAX);
  if (Object.hasOwn(o, "meaning")) patch.meaning = reqText(o, "meaning", MEANING_MAX);
  const closing = optText(o, "closing", CLOSING_MAX);
  if (closing !== undefined) patch.closing = closing;
  if (Object.hasOwn(o, "page")) patch.page = reqEnum(o, "page", WORD_PAGES);
  const position = optPosition(o);
  if (position !== undefined) patch.position = position;
  const status = optEnum(o, "status", CONTENT_STATUSES);
  if (status !== undefined) patch.status = status;
  return patch;
}

/** The `page` filter of the lists: absent means every page; repeated, the last one counts (as for the news filters). */
export function pageFilter(url: URL): WordPageValue | undefined {
  return optEnum(Object.fromEntries(url.searchParams), "page", WORD_PAGES);
}

export function serializePublic(word: Word): WordPublic {
  return {
    id: word.id,
    term: word.term,
    etymology: word.etymology,
    meaning: word.meaning,
    closing: word.closing,
    page: word.page as WordPageValue,
  };
}

export function serializeAdmin(word: Word): WordAdmin {
  return {
    ...serializePublic(word),
    position: word.position,
    status: word.status,
    publishedAt: word.publishedAt ? word.publishedAt.toISOString() : null,
    createdAt: word.createdAt.toISOString(),
    updatedAt: word.updatedAt.toISOString(),
  };
}

function pageRank(page: string): number {
  const index = (WORD_PAGES as readonly string[]).indexOf(page);
  return index === -1 ? WORD_PAGES.length : index;
}

/** The words that match, page by page in the order of WORD_PAGES, and inside a page in WORD_ORDER. */
export async function listWords(where: Prisma.WordWhereInput): Promise<Word[]> {
  const rows = await prisma.word.findMany({ where, orderBy: WORD_ORDER });
  // sort is stable: inside a page the database order is kept.
  return rows.sort((a, b) => pageRank(a.page) - pageRank(b.page));
}

/** The position a word takes at the end of `page`, never beyond POSITION_MAX (WORD_ORDER breaks the ties). */
export async function nextPosition(page: WordPageValue): Promise<number> {
  const last = await prisma.word.aggregate({ where: { page }, _max: { position: true } });
  return Math.min((last._max.position ?? -1) + 1, POSITION_MAX);
}
