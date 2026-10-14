import type { ContentStatusValue } from "../news/dto";

export { CONTENT_STATUSES } from "../news/dto";
export type { ContentStatusValue } from "../news/dto";

/**
 * The pages that can show words, with the same keys as the paths of the site. The public list without a page filter
 * follows this order. Adding a page needs a change here (and in the site), not a migration.
 */
export const WORD_PAGES = [
  "home",
  "mateira",
  "come-lavoriamo",
  "tirreno",
  "programmi",
  "impatto",
  "tirenauti",
  "viaggio-dei-tirenauti",
  "partecipare",
  "collabora-con-mateira",
] as const;
export type WordPageValue = (typeof WORD_PAGES)[number];

/** Texts are plain: a blank line separates paragraphs, a single "\n" is a line break inside one. */
export type WordPublic = {
  id: string;
  term: string;
  etymology: string;
  meaning: string;
  closing: string | null;
  page: WordPageValue;
};

export type WordAdmin = WordPublic & {
  position: number;
  status: ContentStatusValue;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
