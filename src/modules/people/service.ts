import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { HttpError, httpError } from "../../lib/httpErrors";
import { assertOnlyKeys, isUuid, optEnum, optLine, optText, optUuid, reqEnum, reqLine } from "../../lib/validate";
import { prisma } from "../../plugins/prisma";
import { findAllowedType, serializeMedia } from "../media/service";
import { CONTENT_STATUSES, type ContentStatusValue, type MemberPublic } from "../organs/dto";
import { optPosition, POSITION_MAX, serializeMember } from "../organs/service";
import { PERSON_ROLE_KINDS, PUBLIC_PERSON_ROLE_KINDS, type PersonAdmin, type PersonRoleKindValue } from "./dto";

type Obj = Record<string, unknown>;
type Tx = Prisma.TransactionClient;

export const PERSON_NAME_MAX = 120;
export const BIO_MAX = 3000;
export const ROLE_TITLE_MAX = 120;
export const ROLES_MAX = 20;

export const DUPLICATE_ROLE = "duplicate role";
export const ORGAN_REQUIRED = "organId is required for ORGAN_MEMBER";
export const ORGAN_NOT_ALLOWED = "organId is only allowed for ORGAN_MEMBER";

const PERSON_KEYS = ["name", "bio", "photoId", "status", "roles"] as const;
const ROLE_KEYS = ["kind", "organId", "title", "position"] as const;

export type RoleInput = {
  kind: PersonRoleKindValue;
  organId: string | null;
  title: string | null;
  /** undefined: a role that stays keeps its position, a new one goes to the end of its list. */
  position: number | undefined;
};

export type PersonCreateInput = {
  name: string;
  bio: string | null;
  photoId: string | null;
  status: ContentStatusValue;
  roles: RoleInput[];
};

export type PersonPatchInput = {
  name?: string;
  bio?: string | null;
  photoId?: string | null;
  status?: ContentStatusValue;
  roles?: RoleInput[];
};

/** Database order of the admin list; listAdminPeople then sorts by name without telling upper and lower case apart. */
const PERSON_ORDER: Prisma.PersonOrderByWithRelationInput[] = [{ createdAt: "asc" }, { id: "asc" }];

/** The people that match, by name (case-insensitive, Italian collation), then creation date, then id. */
export async function listAdminPeople(where: Prisma.PersonWhereInput): Promise<PersonWithRoles[]> {
  const rows = await prisma.person.findMany({ where, orderBy: PERSON_ORDER, include: WITH_ROLES });
  // sort is stable: people with the same name keep the createdAt, id order of the query.
  return rows.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

export const WITH_ROLES = {
  photo: true,
  roles: {
    include: { organ: { select: { name: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.PersonInclude;

export type PersonWithRoles = Prisma.PersonGetPayload<{ include: typeof WITH_ROLES }>;

const roleKey = (kind: string, organId: string | null) => `${kind}:${organId ?? ""}`;

function parseRole(raw: unknown, index: number): RoleInput {
  const name = `roles[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw httpError(400, `${name} must be an object`);
  const o = raw as Obj;
  try {
    assertOnlyKeys(o, ROLE_KEYS);
    const kind = reqEnum(o, "kind", PERSON_ROLE_KINDS);
    // An empty optional field counts as absent.
    const sent = o.organId !== undefined && o.organId !== null && o.organId !== "";
    let organId: string | null = null;
    if (kind === "ORGAN_MEMBER") {
      if (!sent) throw httpError(400, ORGAN_REQUIRED);
      if (!isUuid(o.organId)) throw httpError(400, "organId must be a uuid");
      organId = o.organId.toLowerCase();
    } else if (sent) {
      throw httpError(400, ORGAN_NOT_ALLOWED);
    }
    return { kind, organId, title: optLine(o, "title", ROLE_TITLE_MAX) ?? null, position: optPosition(o) };
  } catch (err) {
    if (err instanceof HttpError && err.status === 400) throw httpError(400, `${name}.${err.message}`);
    throw err;
  }
}

/** The full list of roles, or undefined when `roles` was not sent. */
export function parseRoles(o: Obj): RoleInput[] | undefined {
  if (!Object.hasOwn(o, "roles")) return undefined;
  const raw = o.roles;
  if (!Array.isArray(raw) || raw.length > ROLES_MAX) {
    throw httpError(400, `roles must be a list of at most ${ROLES_MAX} roles`);
  }
  const roles = raw.map(parseRole);
  const seen = new Set<string>();
  for (const role of roles) {
    const key = roleKey(role.kind, role.organId);
    if (seen.has(key)) throw httpError(400, DUPLICATE_ROLE);
    seen.add(key);
  }
  return roles;
}

/** The photo: an empty string counts as null (an empty optional field is absent). */
function optPhotoId(o: Obj): string | null | undefined {
  return o.photoId === "" ? null : optUuid(o, "photoId");
}

export function parsePersonCreate(o: Obj): PersonCreateInput {
  assertOnlyKeys(o, PERSON_KEYS);
  return {
    name: reqLine(o, "name", PERSON_NAME_MAX),
    bio: optText(o, "bio", BIO_MAX) ?? null,
    photoId: optPhotoId(o) ?? null,
    status: optEnum(o, "status", CONTENT_STATUSES) ?? "DRAFT",
    roles: parseRoles(o) ?? [],
  };
}

export function parsePersonPatch(o: Obj): PersonPatchInput {
  assertOnlyKeys(o, PERSON_KEYS);
  if (Object.keys(o).length === 0) throw httpError(400, "nothing to change");

  const patch: PersonPatchInput = {};
  if (Object.hasOwn(o, "name")) patch.name = reqLine(o, "name", PERSON_NAME_MAX);
  const bio = optText(o, "bio", BIO_MAX);
  if (bio !== undefined) patch.bio = bio;
  const photoId = optPhotoId(o);
  if (photoId !== undefined) patch.photoId = photoId;
  const status = optEnum(o, "status", CONTENT_STATUSES);
  if (status !== undefined) patch.status = status;
  const roles = parseRoles(o);
  if (roles !== undefined) patch.roles = roles;
  return patch;
}

/** `role` and `status` filters of the admin list: absent means no filter, empty or unknown is a 400, repeated counts the last. */
export function personFilters(url: URL): Prisma.PersonWhereInput {
  const params = Object.fromEntries(url.searchParams);
  const role = optEnum(params, "role", PERSON_ROLE_KINDS);
  const status = optEnum(params, "status", CONTENT_STATUSES);
  return {
    ...(role ? { roles: { some: { kind: role } } } : {}),
    ...(status ? { status } : {}),
  };
}

/** 400 when an organ or the photo of the request does not exist, or the photo is not an image. */
export async function checkReferences(roles: RoleInput[] | undefined, photoId: string | null | undefined): Promise<void> {
  const organIds = [...new Set((roles ?? []).flatMap((r) => (r.organId ? [r.organId] : [])))];
  if (organIds.length > 0) {
    const found = await prisma.organ.count({ where: { id: { in: organIds } } });
    if (found !== organIds.length) throw httpError(400, "organId does not match an existing organ");
  }
  if (photoId) {
    const media = await prisma.media.findUnique({ where: { id: photoId }, select: { mimeType: true } });
    if (!media) throw httpError(400, "photoId does not match an existing media");
    if (!findAllowedType(media.mimeType)?.image) throw httpError(400, "photoId must be an image");
  }
}

/** The position a role takes at the end of its list (same kind, and same organ for ORGAN_MEMBER), never beyond POSITION_MAX. */
export async function nextRolePosition(tx: Tx, kind: PersonRoleKindValue, organId: string | null): Promise<number> {
  const last = await tx.personRole.aggregate({ where: { kind, organId }, _max: { position: true } });
  return Math.min((last._max.position ?? -1) + 1, POSITION_MAX);
}

/** Makes the roles of the person exactly `roles`: removes the others, updates those that stay, adds the new ones at the end. */
export async function replaceRoles(tx: Tx, personId: string, roles: RoleInput[]): Promise<void> {
  const existing = await tx.personRole.findMany({ where: { personId } });
  const wanted = new Set(roles.map((r) => roleKey(r.kind, r.organId)));
  const stale = existing.filter((r) => !wanted.has(roleKey(r.kind, r.organId))).map((r) => r.id);
  if (stale.length > 0) await tx.personRole.deleteMany({ where: { id: { in: stale } } });

  const kept = new Map(existing.map((r) => [roleKey(r.kind, r.organId), r]));
  for (const role of roles) {
    const current = kept.get(roleKey(role.kind, role.organId));
    if (current) {
      await tx.personRole.update({
        where: { id: current.id },
        data: { title: role.title, position: role.position ?? current.position },
      });
    } else {
      await tx.personRole.create({
        data: {
          personId,
          kind: role.kind,
          organId: role.organId,
          title: role.title,
          position: role.position ?? (await nextRolePosition(tx, role.kind, role.organId)),
        },
      });
    }
  }
}

export function serializePerson(person: PersonWithRoles): PersonAdmin {
  const media = person.photo ? serializeMedia(person.photo) : null;
  return {
    id: person.id,
    name: person.name,
    bio: person.bio,
    photo: media ? { id: media.id, url: media.url, alt: media.alt } : null,
    status: person.status,
    publishedAt: person.publishedAt ? person.publishedAt.toISOString() : null,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
    roles: person.roles.map((r) => ({
      id: r.id,
      kind: r.kind,
      organId: r.organId,
      organName: r.organ?.name ?? null,
      title: r.title,
      position: r.position,
    })),
  };
}

/** The `role` of the public list: required, one of PROMOTER, TEAM, AMBASSADOR (the last one counts if repeated). */
export function publicRoleFilter(url: URL): (typeof PUBLIC_PERSON_ROLE_KINDS)[number] {
  const role = optEnum(Object.fromEntries(url.searchParams), "role", PUBLIC_PERSON_ROLE_KINDS);
  if (!role) throw httpError(400, `role is required: ${PUBLIC_PERSON_ROLE_KINDS.join(", ")}`);
  return role;
}

/** The published people with that role, in the order of the role. One query: the person and the photo come with the role. */
export async function listPublicPeople(role: (typeof PUBLIC_PERSON_ROLE_KINDS)[number]): Promise<MemberPublic[]> {
  const rows = await prisma.personRole.findMany({
    where: { kind: role, person: { status: "PUBLISHED" } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: { person: { include: { photo: true } } },
  });
  return rows.map(serializeMember);
}
