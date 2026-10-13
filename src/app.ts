import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { json, notFound } from "./lib/http";
import { HttpError } from "./lib/httpErrors";
import { handleAuth } from "./modules/auth/routes";
import { handleMedia } from "./modules/media/routes";
import { handleNews } from "./modules/news/routes";
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

  if (pathname.startsWith("/api/admin")) {
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

  if (await handleAuth(req, res, pathname)) return;
  if (await handleMedia(req, res, url, parts)) return;
  if (await handleNews(req, res, url, parts)) return;

  notFound(res);
}
