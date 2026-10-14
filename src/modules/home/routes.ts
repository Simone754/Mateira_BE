import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import type { Prisma } from "@prisma/client";

import { empty, json, notFound, readJson } from "../../lib/http";
import { httpError } from "../../lib/httpErrors";
import { isPrismaError } from "../../lib/prismaErrors";
import { asObject, isUuid, optEnum, reqEnum } from "../../lib/validate";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { prisma } from "../../plugins/prisma";
import { CONTENT_STATUSES, HOME_BLOCK_TYPES } from "./dto";
import {
  assertImagesUsable,
  assertOnlyKeys,
  listBlocks,
  loadImages,
  nextPosition,
  parseHomeContent,
  parseOrderIds,
  reorderBlocks,
  serializeAdmin,
  serializePublic,
} from "./service";

export async function handleHome(
  req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  parts: string[],
): Promise<boolean> {
  if (parts[0] !== "api") return false;

  if (parts[1] === "public" && parts[2] === "home") return handlePublic(req, res, parts);
  if (parts[1] === "admin" && parts[2] === "home-blocks") return handleAdmin(req, res, parts);
  return false;
}

async function handlePublic(req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> {
  if (req.method !== "GET" || parts.length !== 3) return false;

  const rows = await listBlocks({ status: "PUBLISHED" });
  const images = await loadImages(rows);
  json(res, 200, { blocks: rows.map((row) => serializePublic(row, images)) });
  return true;
}

/** The whole list of blocks, in order, as the administrator sees it. */
async function sendAdminList(res: ServerResponse): Promise<void> {
  const rows = await listBlocks();
  const images = await loadImages(rows);
  json(res, 200, { blocks: rows.map((row) => serializeAdmin(row, images)) });
}

async function handleAdmin(req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> {
  // Before anything else, and for every path under the prefix: an unknown path must not answer differently.
  const session = await requireAdmin(req, res);
  if (!session) return true;

  if (parts.length === 3 && req.method === "GET") {
    await sendAdminList(res);
    return true;
  }

  if (parts.length === 3 && req.method === "POST") {
    const body = asObject(await readJson(req));
    assertOnlyKeys(body, ["type", "content", "status"]);
    const type = reqEnum(body, "type", HOME_BLOCK_TYPES);
    const status = optEnum(body, "status", CONTENT_STATUSES) ?? "DRAFT";
    const content = parseHomeContent(type, body.content);
    await assertImagesUsable(type, content);

    const created = await prisma.homeBlock.create({
      data: {
        type,
        position: await nextPosition(),
        content: content as unknown as Prisma.InputJsonValue,
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });
    json(res, 201, serializeAdmin(created, await loadImages([created])));
    return true;
  }

  if (parts.length === 4 && parts[3] === "order" && req.method === "PUT") {
    const body = asObject(await readJson(req));
    assertOnlyKeys(body, ["ids"]);
    const ids = parseOrderIds(body.ids);

    try {
      await reorderBlocks(ids);
    } catch (err) {
      // The database gave up on two racing transactions (write conflict or deadlock): nothing was written.
      if (isPrismaError(err, "P2034")) throw httpError(409, "the blocks changed while the order was being saved: try again");
      throw err;
    }
    await sendAdminList(res);
    return true;
  }

  if (parts.length === 4 && isUuid(parts[3])) {
    const id = parts[3];

    if (req.method === "DELETE") {
      // deleteMany does not throw when a concurrent request got there first: only one request sees count 1.
      const { count } = await prisma.homeBlock.deleteMany({ where: { id } });
      if (count === 0) notFound(res);
      else empty(res, 204);
      return true;
    }

    const existing = await prisma.homeBlock.findUnique({ where: { id } });
    if (!existing) {
      notFound(res);
      return true;
    }

    if (req.method === "GET") {
      json(res, 200, serializeAdmin(existing, await loadImages([existing])));
      return true;
    }

    if (req.method === "PATCH") {
      const body = asObject(await readJson(req));
      if (Object.hasOwn(body, "type")) throw httpError(400, "type cannot be changed");
      assertOnlyKeys(body, ["content", "status"]);
      const status = optEnum(body, "status", CONTENT_STATUSES);
      const hasContent = Object.hasOwn(body, "content");
      if (!hasContent && status === undefined) throw httpError(400, "content or status is required");

      const data: Prisma.HomeBlockUpdateInput = {};
      if (hasContent) {
        // Replaces the whole content and checks it again for the type this block has had since it was created.
        const content = parseHomeContent(existing.type, body.content);
        await assertImagesUsable(existing.type, content);
        data.content = content as unknown as Prisma.InputJsonValue;
      }
      if (status !== undefined) {
        data.status = status;
        if (status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
      }

      let updated;
      try {
        updated = await prisma.homeBlock.update({ where: { id }, data });
      } catch (err) {
        // A concurrent request deleted the block after the lookup above.
        if (!isPrismaError(err, "P2025")) throw err;
        notFound(res);
        return true;
      }
      json(res, 200, serializeAdmin(updated, await loadImages([updated])));
      return true;
    }
  }

  return false;
}
