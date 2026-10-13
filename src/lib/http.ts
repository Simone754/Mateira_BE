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

const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const BRACKETED_IPV6 = /^\[([^\]]*)\](?::\d+)?$/;

/** Strips the port, the IPv6 brackets and the IPv4-mapped prefix, so the same client always gets the same key. */
function normalizeIp(value: string): string {
  let ip = value.trim();
  const bracketed = BRACKETED_IPV6.exec(ip);
  if (bracketed) ip = bracketed[1];
  else ip = IPV4_WITH_PORT.exec(ip)?.[1] ?? ip;
  return IPV4_MAPPED.exec(ip)?.[1] ?? ip;
}

/**
 * Returns the address of the client.
 *
 * With `hops` at 0 (no proxy in front of the app) the socket address is used and X-Forwarded-For is ignored,
 * because any client can send that header. With `hops` = N the app sits behind N trusted proxies, and each one
 * appends the address it received the request from. The client is therefore the Nth entry from the right, the
 * address added by the outermost trusted proxy; entries further left were supplied by the client and can be
 * spoofed. All values of a repeated header are read. With fewer than N entries the request did not go through
 * the proxies, so the socket address is used.
 */
export function clientIp(req: IncomingMessage, hops: number): string {
  const socketAddress = req.socket.remoteAddress || "unknown";
  if (hops <= 0) return socketAddress;

  const header = req.headers["x-forwarded-for"];
  const entries = (Array.isArray(header) ? header.join(",") : (header ?? ""))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length < hops) return socketAddress;

  return normalizeIp(entries[entries.length - hops]) || "unknown";
}
