import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid } from "../../lib/validate";
import { type AdminSession, hasSession } from "../../middlewares/adminGuard";
import { prisma } from "../../plugins/prisma";
import { DUPLICATE_ROLE } from "../organs/service";
import {
  checkReferences,
  parsePersonCreate,
  parsePersonPatch,
  PERSON_ORDER,
  personFilters,
  replaceRoles,
  serializePerson,
  WITH_ROLES,
} from "./service";

export async function handlePeople(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (parts[0] !== "api" || parts[1] !== "admin" || parts[2] !== "people") return false;
  if (!hasSession(res, session)) return true;

  if (parts.length === 3 && req.method === "GET") {
    const rows = await prisma.person.findMany({ where: personFilters(url), orderBy: PERSON_ORDER, include: WITH_ROLES });
    json(res, 200, { people: rows.map(serializePerson) });
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const input = parsePersonCreate(asObject(await readJson(req)));
    await checkReferences(input.roles, input.photoId);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const person = await tx.person.create({
          data: {
            name: input.name,
            bio: input.bio,
            photoId: input.photoId,
            status: input.status,
            publishedAt: input.status === "PUBLISHED" ? new Date() : null,
          },
        });
        await replaceRoles(tx, person.id, input.roles);
        return tx.person.findUniqueOrThrow({ where: { id: person.id }, include: WITH_ROLES });
      });
      json(res, 201, serializePerson(created));
    } catch (err) {
      await mapWriteError(err, res);
    }
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];

    if (req.method === "DELETE") {
      // deleteMany does not throw when a concurrent request got there first. The roles go with it (ON DELETE CASCADE).
      const { count } = await prisma.person.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    const existing = await prisma.person.findUnique({ where: { id }, include: WITH_ROLES });
    if (!existing) {
      notFound(res);
      return true;
    }

    if (req.method === "GET") {
      json(res, 200, serializePerson(existing));
      return true;
    }

    if (req.method === "PATCH") {
      const patch = parsePersonPatch(asObject(await readJson(req)));
      await checkReferences(patch.roles, patch.photoId);

      const data: Prisma.PersonUncheckedUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.bio !== undefined) data.bio = patch.bio;
      if (patch.photoId !== undefined) data.photoId = patch.photoId;
      if (patch.status !== undefined) {
        data.status = patch.status;
        if (patch.status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          // Also when only the roles change: it fails with P2025 if a concurrent delete won, and bumps updatedAt.
          await tx.person.update({ where: { id }, data });
          if (patch.roles) await replaceRoles(tx, id, patch.roles);
          return tx.person.findUniqueOrThrow({ where: { id }, include: WITH_ROLES });
        });
        json(res, 200, serializePerson(updated));
      } catch (err) {
        await mapWriteError(err, res, id);
      }
      return true;
    }
  }

  return false;
}

/** Errors of a concurrent request: the person vanished (404), the same role written twice (409), an organ or photo vanished (400). */
async function mapWriteError(err: unknown, res: ServerResponse, personId?: string): Promise<void> {
  if (isPrismaError(err, "P2025")) return notFound(res);
  if (isPrismaError(err, "P2002") || isPrismaError(err, "P2034")) throw httpError(409, DUPLICATE_ROLE);
  if (isPrismaError(err, "P2003")) {
    // A foreign key failed after the checks: the person (when it is an update), an organ or the photo was deleted.
    if (personId && (await prisma.person.count({ where: { id: personId } })) === 0) return notFound(res);
    throw httpError(400, "organId or photoId no longer exists");
  }
  throw err;
}
