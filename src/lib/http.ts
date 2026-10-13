import { IncomingMessage, ServerResponse } from "node:http";

import { httpError } from "./httpErrors";

export function json(res: ServerResponse, status: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(data);
}

export function empty(res: ServerResponse, status: number): void {
  res.statusCode = status;
  res.end();
}

export function badRequest(res: ServerResponse, message?: string): void {
  json(res, 400, { error: message || "Bad request" });
}

export function unauthorized(res: ServerResponse, message?: string): void {
  json(res, 401, { error: message || "Unauthorized" });
}

export function forbidden(res: ServerResponse): void {
  json(res, 403, { error: "Forbidden" });
}

export function notFound(res: ServerResponse, message?: string): void {
  json(res, 404, { error: message || "Not found" });
}

export function tooManyRequests(res: ServerResponse, retryAfterSec: number): void {
  res.setHeader("Retry-After", String(retryAfterSec));
  json(res, 429, { error: "Too many requests" });
}

const MAX_BODY_BYTES = 1_000_000;

export async function readJson<T = unknown>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw httpError(413, "payload too large");
    }
    chunks.push(buf);
  }

  if (size === 0) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw httpError(400, "invalid json");
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }

  return out;
}

export type CookieOptions = {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Strict"}`);
  return parts.join("; ");
}

export function setCookie(res: ServerResponse, cookie: string): void {
  const previous = res.getHeader("Set-Cookie");
  const list = Array.isArray(previous) ? previous : previous ? [String(previous)] : [];
  res.setHeader("Set-Cookie", [...list, cookie]);
}

/** When trustProxy is true the first X-Forwarded-For entry is used, which is only safe if the proxy overwrites the header instead of appending to it. */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers["x-forwarded-for"];
    const first = (Array.isArray(header) ? header[0] : header)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || "unknown";
}
