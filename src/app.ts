import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { json, notFound } from "./lib/http";
import { HttpError } from "./lib/httpErrors";
import { isGuardedAdminRequest } from "./middlewares/adminGuard";
import { type AdminSession, requireAdmin } from "./middlewares/requireAdmin";
import { handleAuth } from "./modules/auth/routes";
import { handleDocs } from "./modules/docs/routes";
import { handleHome } from "./modules/home/routes";
import { handleMedia } from "./modules/media/routes";
import { handleNews } from "./modules/news/routes";
import { handleWords } from "./modules/words/routes";
import { applyCors } from "./plugins/cors";
import { prisma } from "./plugins/prisma";

export function createApp(): http.Server {
  return http.createServer((req, res) => {
    applyCors(req, res);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    handleRequest(req, res).catch((err: unknown) => {
      // A response that already started cannot be replaced by an error body: cut the connection instead.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (err instanceof HttpError) {
        // The rest of an oversized body is never read, so the connection cannot be reused.
        if (err.status === 413) res.setHeader("Connection", "close");
        return json(res, err.status, { error: err.message });
      }
      console.error(err);
      json(res, 500, { error: "Internal server error" });
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Only the path and the query are used: the Host header is client input and must not be able to break URL parsing.
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "api" && parts[1] === "admin") {
    res.setHeader("Cache-Control", "no-store");
  }

  if (req.method === "GET" && pathname === "/api/health") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      json(res, 200, { status: "ok" });
    } catch {
      json(res, 503, { status: "degraded" });
    }
    return;
  }

  // Documentation lives outside /api (/docs, /openapi.json): it needs no token.
  if (await handleDocs(req, res, pathname)) return;

  // One check for the whole admin area, on the same parts the routers match: they get the verified session.
  let session: AdminSession | null = null;
  if (isGuardedAdminRequest(req.method, parts)) {
    session = await requireAdmin(req, res);
    if (!session) return;
  }

  if (await handleAuth(req, res, pathname, session)) return;
  if (await handleMedia(req, res, url, parts, session)) return;
  if (await handleNews(req, res, url, parts, session)) return;
  if (await handleHome(req, res, url, parts, session)) return;
  if (await handleWords(req, res, url, parts, session)) return;

  notFound(res);
}
