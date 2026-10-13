import crypto from "node:crypto";

import { JWT_EXPIRES_IN, JWT_SECRET } from "../config/settings";

export type JwtPayload = { sub: string; iat?: number; exp?: number } & Record<string, unknown>;

export function signJwt(payload: { sub: string } & Record<string, unknown>, expiresInSec = JWT_EXPIRES_IN): string {
  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSec;
  const body = { ...payload, iat, exp };

  const encoded = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`;
  return `${encoded}.${sign(encoded)}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const expectedBuf = Buffer.from(sign(`${headerB64}.${payloadB64}`));
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, signatureBuf)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;

  const typed = payload as JwtPayload;
  if (typeof typed.sub !== "string") return null;
  if (typeof typed.exp !== "number" || Math.floor(Date.now() / 1000) >= typed.exp) return null;
  return typed;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input).toString("base64url");
}
