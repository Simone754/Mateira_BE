import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid } from "../../lib/validate";
import { type AdminSession, hasSession } from "../../middlewares/adminGuard";
import { prisma } from "../../plugins/prisma";
import {
  categoryFilter,
  DUPLICATE_ORGAN,
  findOrganDetail,
  listOrgans,
  listPublicOrgans,
  nextPosition,
  parseOrganCreate,
  parseOrganPatch,
  serializeAdmin,
  WITH_COUNT,
} from "./service";

export async function handleOrgans(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (parts[0] !== "api" || parts[2] !== "organs") return false;

  if (parts[1] === "public") return handlePublic(req, res, url, parts);
  if (parts[1] === "admin") return handleAdmin(req, res, url, parts, session);
  return false;
}

async function handlePublic(req: IncomingMessage, res: ServerResponse, url: URL, parts: string[]): Promise<boolean> {
  if (req.method !== "GET" || parts.length !== 3) return false;

  const category = categoryFilter(url);
  json(res, 200, { organs: await listPublicOrgans(category) });
  return true;
}

async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  parts: string[],
  session: AdminSession | null,
): Promise<boolean> {
  if (!hasSession(res, session)) return true;

  if (parts.length === 3 && req.method === "GET") {
    const category = categoryFilter(url);
    const rows = await listOrgans(category ? { category } : {});
    json(res, 200, { organs: rows.map(serializeAdmin) });
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const input = parseOrganCreate(asObject(await readJson(req)));
    try {
      const created = await prisma.organ.create({
        data: {
          name: input.name,
          category: input.category,
          description: input.description,
          position: input.position ?? (await nextPosition(input.category)),
          status: input.status,
          publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        },
        include: WITH_COUNT,
      });
      json(res, 201, serializeAdmin(created));
    } catch (err) {
      // The same name, also when a concurrent request created it a moment ago.
      if (isPrismaError(err, "P2002")) throw httpError(409, DUPLICATE_ORGAN);
      throw err;
    }
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];

    if (req.method === "DELETE") {
      // deleteMany does not throw when a concurrent request got there first: only one request sees count 1.
      // The roles in the organ go with it (ON DELETE CASCADE).
      const { count } = await prisma.organ.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    const existing = await prisma.organ.findUnique({ where: { id }, include: WITH_COUNT });
    if (!existing) {
      notFound(res);
      return true;
    }

    if (req.method === "GET") {
      const detail = await findOrganDetail(id);
      if (detail) json(res, 200, detail);
      else notFound(res);
      return true;
    }

    if (req.method === "PATCH") {
      const patch = parseOrganPatch(asObject(await readJson(req)));

      const data: Prisma.OrganUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.category !== undefined) data.category = patch.category;
      if (patch.position !== undefined) data.position = patch.position;
      else if (patch.category !== undefined && patch.category !== existing.category) {
        data.position = await nextPosition(patch.category);
      }
      if (patch.status !== undefined) {
        data.status = patch.status;
        if (patch.status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
      }

      try {
        const updated = await prisma.organ.update({ where: { id }, data, include: WITH_COUNT });
        json(res, 200, serializeAdmin(updated));
      } catch (err) {
        // A concurrent request deleted the organ after the lookup above.
        if (isPrismaError(err, "P2025")) notFound(res);
        else if (isPrismaError(err, "P2002")) throw httpError(409, DUPLICATE_ORGAN);
        else throw err;
      }
      return true;
    }
  }

  return false;
}
