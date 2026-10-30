-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('INSTITUTIONAL', 'TRANSPARENCY');

-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('RESEARCH', 'REPORT', 'PAPER', 'PUBLICATION', 'DATA', 'ATLAS', 'SCENARIO', 'CITIZEN_SCIENCE', 'LIVING_ARCHIVE');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "section" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "fileId" TEXT,
    "externalUrl" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "PublicationType" NOT NULL,
    "authors" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "abstract" TEXT,
    "fileId" TEXT,
    "externalUrl" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_category_status_section_date_idx" ON "Document"("category", "status", "section", "date");

-- CreateIndex
CREATE INDEX "Publication_status_type_date_idx" ON "Publication"("status", "type", "date");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A file and an external URL never together (Prisma cannot express CHECK constraints). Neither is allowed: it is what a deleted file leaves.
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_xor_url" CHECK (NOT ("fileId" IS NOT NULL AND "externalUrl" IS NOT NULL));
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_file_xor_url" CHECK (NOT ("fileId" IS NOT NULL AND "externalUrl" IS NOT NULL));
