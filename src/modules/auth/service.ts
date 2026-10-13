import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

import { BCRYPT_SALT_ROUNDS, REFRESH_TOKEN_TTL } from "../../config/settings";
import { httpError } from "../../lib/httpErrors";
import { prisma } from "../../plugins/prisma";
import { AuthUser } from "./dto";

export const PASSWORD_MIN_LENGTH = 12;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: string | null = null;

/** Spends the same time as a real check so unknown emails are not detectable by timing. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash("not-a-real-password", BCRYPT_SALT_ROUNDS);
  await bcrypt.compare(password, dummyHash);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
    },
  });
  return token;
}

export type RotateResult = { ok: true; userId: string; token: string } | { ok: false };

/**
 * Single-use refresh tokens. Presenting an already-used token means it leaked:
 * every token of that user is revoked.
 */
export async function rotateRefreshToken(token: string): Promise<RotateResult> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return { ok: false };

  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false };
  }

  if (row.expiresAt.getTime() <= Date.now()) return { ok: false };

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) return { ok: false };

  return { ok: true, userId: row.userId, token: await issueRefreshToken(row.userId) };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function serializeUser(user: User): AuthUser {
  return { id: user.id, email: user.email, role: user.role };
}

export async function ensureSuperuser(email: string, password: string): Promise<User> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) throw httpError(400, "email is not valid");
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw httpError(400, `password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const passwordHash = await hashPassword(password);
  return prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, passwordHash, role: "SUPERUSER" },
    update: { passwordHash },
  });
}
