import { IncomingMessage, ServerResponse } from "node:http";

import type { User } from "@prisma/client";

import { unauthorized } from "../lib/http";
import { verifyJwt } from "../plugins/jwt";
import { prisma } from "../plugins/prisma";

export type AdminSession = { user: User };

/** Sends 401 and returns null when the request is not an authenticated superuser. */
export async function requireAdmin(req: IncomingMessage, res: ServerResponse): Promise<AdminSession | null> {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    unauthorized(res);
    return null;
  }

  const payload = verifyJwt(match[1]);
  if (!payload || payload.role !== "SUPERUSER") {
    unauthorized(res);
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.role !== "SUPERUSER") {
    unauthorized(res);
    return null;
  }

  return { user };
}
