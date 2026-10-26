-- CreateEnum
CREATE TYPE "OrganCategory" AS ENUM ('GOVERNANCE', 'ADVISORY');

-- CreateEnum
CREATE TYPE "PersonRoleKind" AS ENUM ('PROMOTER', 'TEAM', 'AMBASSADOR', 'ORGAN_MEMBER');

-- CreateTable
CREATE TABLE "Organ" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "OrganCategory" NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "photoId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRole" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "PersonRoleKind" NOT NULL,
    "organId" TEXT,
    "title" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organ_name_key" ON "Organ"("name");

-- CreateIndex
CREATE INDEX "Organ_category_status_position_idx" ON "Organ"("category", "status", "position");

-- CreateIndex
CREATE INDEX "PersonRole_kind_organId_position_idx" ON "PersonRole"("kind", "organId", "position");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_organId_fkey" FOREIGN KEY ("organId") REFERENCES "Organ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One role per person and list; NULLS NOT DISTINCT makes organId null count as a value (Postgres 15+), which Prisma cannot express.
CREATE UNIQUE INDEX "PersonRole_personId_kind_organId_key" ON "PersonRole" ("personId", "kind", "organId") NULLS NOT DISTINCT;
