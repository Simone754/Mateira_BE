import type { ContentStatusValue } from "../organs/dto";

export const PERSON_ROLE_KINDS = ["PROMOTER", "TEAM", "AMBASSADOR", "ORGAN_MEMBER"] as const;
export type PersonRoleKindValue = (typeof PERSON_ROLE_KINDS)[number];

export type PersonRoleAdmin = {
  id: string;
  kind: PersonRoleKindValue;
  organId: string | null;
  organName: string | null;
  title: string | null;
  position: number;
};

export type PersonAdmin = {
  id: string;
  name: string;
  bio: string | null;
  photo: { id: string; url: string | null; alt: string | null } | null;
  status: ContentStatusValue;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: PersonRoleAdmin[];
};
