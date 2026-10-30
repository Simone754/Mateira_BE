import type { FileRef, LinkPublic } from "../../lib/fileLinkTypes";
import type { ContentStatusValue } from "../organs/dto";

export const PUBLICATION_TYPES = [
  "RESEARCH",
  "REPORT",
  "PAPER",
  "PUBLICATION",
  "DATA",
  "ATLAS",
  "SCENARIO",
  "CITIZEN_SCIENCE",
  "LIVING_ARCHIVE",
] as const;
export type PublicationTypeValue = (typeof PUBLICATION_TYPES)[number];

export const PUBLICATION_TITLE_MAX = 200;
export const PUBLICATION_AUTHORS_MAX = 300;
export const PUBLICATION_ABSTRACT_MAX = 3000;

/** `abstract` is plain text: a blank line separates paragraphs. `date` is a day (midnight UTC). */
export type PublicationPublic = {
  id: string;
  title: string;
  type: PublicationTypeValue;
  authors: string | null;
  date: string;
  abstract: string | null;
  link: LinkPublic;
};

/** `file` and `externalUrl` are both null when the file was deleted from the media library. */
export type PublicationAdmin = {
  id: string;
  title: string;
  type: PublicationTypeValue;
  authors: string | null;
  date: string;
  abstract: string | null;
  file: FileRef | null;
  externalUrl: string | null;
  status: ContentStatusValue;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
