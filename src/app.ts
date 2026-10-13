import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { json, notFound } from "./lib/http";
import { HttpError } from "./lib/httpErrors";
import { handleAuth } from "./modules/auth/routes";
import { handleMedia } from "./modules/media/routes";
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
      if (err instanceof HttpError) {
        return json(res, err.status, { error: err.message });
      }
      console.error(err);
      json(res, 500, { error: "Internal server error" });
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
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

  void parts;
  notFound(res);
}
