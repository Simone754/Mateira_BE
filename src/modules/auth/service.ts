import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import type { Prisma, User } from "@prisma/client";

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

export async function issueRefreshToken(userId: string, db: Prisma.TransactionClient = prisma): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
    },
  });
  return token;
}

export type RotateResult = { ok: true; userId: string; token: string } | { ok: false };

async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Single-use refresh tokens. Presenting an already-used token means it leaked:
 * every token of that user is revoked.
 */
export async function rotateRefreshToken(token: string): Promise<RotateResult> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return { ok: false };

  if (row.revokedAt) {
    await revokeAllRefreshTokens(row.userId);
    return { ok: false };
  }

  if (row.expiresAt.getTime() <= Date.now()) return { ok: false };

  // Claim the old token and create the new one atomically: a request that loses the race waits for the
  // winner to commit, matches nothing, and then revokes the whole chain, winner's new token included.
  const newToken = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    return issueRefreshToken(row.userId, tx);
  });

  if (newToken === null) {
    await revokeAllRefreshTokens(row.userId);
    return { ok: false };
  }

  return { ok: true, userId: row.userId, token: newToken };
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

/**
 * Makes the given credentials THE superuser: creates it when none exists, otherwise updates its email and password
 * to match. Refuses to touch anything when more than one superuser exists.
 */
export async function ensureSuperuser(email: string, password: string): Promise<User> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) throw httpError(400, "email is not valid");
  if (password.trim().length < PASSWORD_MIN_LENGTH) {
    throw httpError(400, `password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  // Two rows are enough to know the answer: none, exactly one, or more than one.
  const superusers = await prisma.user.findMany({ where: { role: "SUPERUSER" }, take: 2 });
  if (superusers.length > 1) {
    throw httpError(409, "more than one superuser exists; remove the extra ones manually");
  }

  if (superusers.length === 0) {
    return prisma.user.create({
      data: { email: normalized, passwordHash: await hashPassword(password), role: "SUPERUSER" },
    });
  }

  const existing = superusers[0];
  const samePassword = await verifyPassword(password, existing.passwordHash);

  // Re-running the seed with the same credentials changes nothing and keeps sessions alive.
  if (existing.email === normalized && samePassword) return existing;

  // A new email or password ends every session opened with the old ones.
  const passwordHash = samePassword ? existing.passwordHash : await hashPassword(password);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: existing.id }, data: { email: normalized, passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return updated;
}
