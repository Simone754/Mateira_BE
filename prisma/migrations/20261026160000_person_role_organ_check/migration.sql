-- A role has an organ if and only if it is ORGAN_MEMBER (Prisma cannot express CHECK constraints).
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_organ_iff_member" CHECK (("kind" = 'ORGAN_MEMBER') = ("organId" IS NOT NULL));
