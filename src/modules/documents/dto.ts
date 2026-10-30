import type { FileRef, LinkPublic } from "../../lib/fileLink";
import type { ContentStatusValue } from "../organs/dto";

export const DOCUMENT_CATEGORIES = ["INSTITUTIONAL", "TRANSPARENCY"] as const;
export type DocumentCategoryValue = (typeof DOCUMENT_CATEGORIES)[number];

/** `description` is plain text: a blank line separates paragraphs. `date` is a day (midnight UTC). */
export type DocumentPublic = {
  id: string;
  title: string;
  section: string | null;
  date: string;
  description: string | null;
  link: LinkPublic;
};

/** `file` and `externalUrl` are both null when the file was deleted from the media library. */
export type DocumentAdmin = {
  id: string;
  title: string;
  category: DocumentCategoryValue;
  section: string | null;
  date: string;
  description: string | null;
  file: FileRef | null;
  externalUrl: string | null;
  status: ContentStatusValue;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
