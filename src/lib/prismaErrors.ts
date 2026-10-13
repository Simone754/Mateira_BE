import { Prisma } from "@prisma/client";

/** True when err is a Prisma request error with the given code, e.g. P2002 (unique violation) or P2025 (record not found). */
export function isPrismaError(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}
