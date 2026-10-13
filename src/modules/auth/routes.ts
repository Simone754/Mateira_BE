import { IncomingMessage, ServerResponse } from "node:http";

import type { User } from "@prisma/client";

import {
  COOKIE_SECURE,
  JWT_EXPIRES_IN,
  LOGIN_RATE_MAX,
  LOGIN_RATE_WINDOW,
  REFRESH_TOKEN_TTL,
  TRUST_PROXY,
} from "../../config/settings";
import {
  clientIp,
  empty,
  json,
  parseCookies,
  readJson,
  serializeCookie,
  setCookie,
  tooManyRequests,
  unauthorized,
} from "../../lib/http";
import { createRateLimiter } from "../../lib/rateLimit";
import { asObject, reqString } from "../../lib/validate";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { signJwt } from "../../plugins/jwt";
import { prisma } from "../../plugins/prisma";
import { AuthResponse } from "./dto";
import {
  burnPasswordCheck,
  issueRefreshToken,
  normalizeEmail,
  revokeRefreshToken,
  rotateRefreshToken,
  serializeUser,
  verifyPassword,
} from "./service";

const REFRESH_COOKIE = "mateira_refresh";
const COOKIE_PATH = "/api/admin/auth";

const loginByAccount = createRateLimiter({ windowMs: LOGIN_RATE_WINDOW * 1000, max: LOGIN_RATE_MAX });
const loginByIp = createRateLimiter({ windowMs: LOGIN_RATE_WINDOW * 1000, max: LOGIN_RATE_MAX * 4 });

export function resetLoginLimiters(): void {
  loginByAccount.clear();
  loginByIp.clear();
}

function refreshCookie(token: string): string {
  return serializeCookie(REFRESH_COOKIE, token, {
    path: COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL,
    secure: COOKIE_SECURE,
    httpOnly: true,
    sameSite: "Strict",
  });
}

function clearedCookie(): string {
  return serializeCookie(REFRESH_COOKIE, "", { path: COOKIE_PATH, maxAge: 0, secure: COOKIE_SECURE });
}

function accessResponse(user: User): AuthResponse {
  return {
    accessToken: signJwt({ sub: user.id, role: user.role }),
    expiresIn: JWT_EXPIRES_IN,
    user: serializeUser(user),
  };
}

export async function handleAuth(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith("/api/admin/auth/")) return false;

  if (req.method === "POST" && pathname === "/api/admin/auth/login") {
    const body = asObject(await readJson(req));
    const email = normalizeEmail(reqString(body, "email", 254));
    const password = reqString(body, "password", 200);

    const ip = clientIp(req, TRUST_PROXY);
    const accountKey = `${ip}|${email}`;
    const blocked = [loginByAccount.check(accountKey), loginByIp.check(ip)].find((state) => !state.allowed);
    if (blocked) {
      tooManyRequests(res, blocked.retryAfterSec);
      return true;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    let valid = false;
    if (user) valid = await verifyPassword(password, user.passwordHash);
    else await burnPasswordCheck(password);

    if (!user || !valid) {
      loginByAccount.hit(accountKey);
      loginByIp.hit(ip);
      unauthorized(res, "Invalid credentials");
      return true;
    }

    loginByAccount.reset(accountKey);
    setCookie(res, refreshCookie(await issueRefreshToken(user.id)));
    json(res, 200, accessResponse(user));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/admin/auth/refresh") {
    const token = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    if (!token) {
      unauthorized(res);
      return true;
    }

    const rotated = await rotateRefreshToken(token);
    const user = rotated.ok ? await prisma.user.findUnique({ where: { id: rotated.userId } }) : null;
    if (!rotated.ok || !user) {
      setCookie(res, clearedCookie());
      unauthorized(res);
      return true;
    }

    setCookie(res, refreshCookie(rotated.token));
    json(res, 200, accessResponse(user));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/admin/auth/logout") {
    const token = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    setCookie(res, clearedCookie());
    empty(res, 204);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/admin/auth/me") {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    json(res, 200, { user: serializeUser(session.user) });
    return true;
  }

  return false;
}
