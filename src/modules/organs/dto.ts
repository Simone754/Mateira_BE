import type { ContentStatusValue } from "../news/dto";

export { CONTENT_STATUSES } from "../news/dto";
export type { ContentStatusValue } from "../news/dto";

/** GOVERNANCE: governing bodies (Governance page). ADVISORY: committees and advisory boards. Public lists follow this order. */
export const ORGAN_CATEGORIES = ["GOVERNANCE", "ADVISORY"] as const;
export type OrganCategoryValue = (typeof ORGAN_CATEGORIES)[number];

/** A person as the site shows it in a list; `id` is the id of the person, `title` the title of that role. */
export type MemberPublic = {
  id: string;
  name: string;
  bio: string | null;
  photo: { id: string; url: string | null; alt: string | null } | null;
  title: string | null;
};

/** Texts are plain: a blank line separates paragraphs, a single "\n" is a line break inside one. */
export type OrganPublic = {
  id: string;
  name: string;
  category: OrganCategoryValue;
  description: string | null;
  members: MemberPublic[];
};

export type OrganAdmin = Omit<OrganPublic, "members"> & {
  position: number;
  status: ContentStatusValue;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
};
