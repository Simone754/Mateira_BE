import { URL } from "node:url";

import type { Organ, Prisma } from "@prisma/client";

import { httpError } from "../../lib/httpErrors";
import { assertOnlyKeys, optEnum, optText, reqEnum, reqLine } from "../../lib/validate";
import { prisma } from "../../plugins/prisma";
import {
  CONTENT_STATUSES,
  type ContentStatusValue,
  ORGAN_CATEGORIES,
  type OrganAdmin,
  type OrganCategoryValue,
  type OrganPublic,
} from "./dto";

type Obj = Record<string, unknown>;

export const ORGAN_NAME_MAX = 160;
export const ORGAN_DESCRIPTION_MAX = 3000;
export const PERSON_NAME_MAX = 120;
export const BIO_MAX = 3000;
export const ROLE_TITLE_MAX = 120;
export const ROLES_MAX = 20;
export const POSITION_MAX = 9999;

export const DUPLICATE_ORGAN = "an organ with this name already exists";
export const DUPLICATE_ROLE = "duplicate role";
export const ORGAN_REQUIRED = "organId is required for ORGAN_MEMBER";
export const ORGAN_NOT_ALLOWED = "organId is only allowed for ORGAN_MEMBER";

const ORGAN_KEYS = ["name", "category", "description", "position", "status"] as const;

/** Inside a category: by position; the same position keeps a stable order. */
export const ORGAN_ORDER: Prisma.OrganOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

export type OrganCreateInput = {
  name: string;
  category: OrganCategoryValue;
  description: string | null;
  /** undefined: at the end of the category. */
  position: number | undefined;
  status: ContentStatusValue;
};

/** Only the fields that were sent; `description: null` removes the description. */
export type OrganPatchInput = {
  name?: string;
  category?: OrganCategoryValue;
  description?: string | null;
  position?: number;
  status?: ContentStatusValue;
};

/** A position from 0 to POSITION_MAX, or undefined when the field was not sent. */
export function optPosition(o: Obj): number | undefined {
  if (!Object.hasOwn(o, "position")) return undefined;
  const value = o.position;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > POSITION_MAX) {
    throw httpError(400, `position must be an integer from 0 to ${POSITION_MAX}`);
  }
  return value;
}

export function parseOrganCreate(o: Obj): OrganCreateInput {
  assertOnlyKeys(o, ORGAN_KEYS);
  return {
    name: reqLine(o, "name", ORGAN_NAME_MAX),
    category: reqEnum(o, "category", ORGAN_CATEGORIES),
    description: optText(o, "description", ORGAN_DESCRIPTION_MAX) ?? null,
    position: optPosition(o),
    status: optEnum(o, "status", CONTENT_STATUSES) ?? "DRAFT",
  };
}

export function parseOrganPatch(o: Obj): OrganPatchInput {
  assertOnlyKeys(o, ORGAN_KEYS);
  if (Object.keys(o).length === 0) throw httpError(400, "nothing to change");

  const patch: OrganPatchInput = {};
  if (Object.hasOwn(o, "name")) patch.name = reqLine(o, "name", ORGAN_NAME_MAX);
  if (Object.hasOwn(o, "category")) patch.category = reqEnum(o, "category", ORGAN_CATEGORIES);
  const description = optText(o, "description", ORGAN_DESCRIPTION_MAX);
  if (description !== undefined) patch.description = description;
  const position = optPosition(o);
  if (position !== undefined) patch.position = position;
  const status = optEnum(o, "status", CONTENT_STATUSES);
  if (status !== undefined) patch.status = status;
  return patch;
}

/** The `category` filter of the lists: absent means every category; repeated, the last one counts (as for the news filters). */
export function categoryFilter(url: URL): OrganCategoryValue | undefined {
  return optEnum(Object.fromEntries(url.searchParams), "category", ORGAN_CATEGORIES);
}

export type OrganWithCount = Organ & { _count: { roles: number } };

export function serializePublic(organ: Organ): Omit<OrganPublic, "members"> {
  return {
    id: organ.id,
    name: organ.name,
    category: organ.category,
    description: organ.description,
  };
}

export function serializeAdmin(organ: OrganWithCount): OrganAdmin {
  return {
    ...serializePublic(organ),
    position: organ.position,
    status: organ.status,
    publishedAt: organ.publishedAt ? organ.publishedAt.toISOString() : null,
    createdAt: organ.createdAt.toISOString(),
    updatedAt: organ.updatedAt.toISOString(),
    memberCount: organ._count.roles,
  };
}

/** Counts the roles in the organ, drafts included (only ORGAN_MEMBER roles have an organId). */
export const WITH_COUNT = { _count: { select: { roles: true } } } as const;

function categoryRank(category: string): number {
  const index = (ORGAN_CATEGORIES as readonly string[]).indexOf(category);
  return index === -1 ? ORGAN_CATEGORIES.length : index;
}

/** The organs that match, category by category in the order of ORGAN_CATEGORIES, and inside a category in ORGAN_ORDER. */
export async function listOrgans(where: Prisma.OrganWhereInput): Promise<OrganWithCount[]> {
  const rows = await prisma.organ.findMany({ where, orderBy: ORGAN_ORDER, include: WITH_COUNT });
  // sort is stable: inside a category the database order is kept.
  return rows.sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
}

/** The position an organ takes at the end of `category`, never beyond POSITION_MAX (ORGAN_ORDER breaks the ties). */
export async function nextPosition(category: OrganCategoryValue): Promise<number> {
  const last = await prisma.organ.aggregate({ where: { category }, _max: { position: true } });
  return Math.min((last._max.position ?? -1) + 1, POSITION_MAX);
}
