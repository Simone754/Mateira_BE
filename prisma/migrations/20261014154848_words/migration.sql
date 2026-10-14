-- CreateTable
CREATE TABLE "Word" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "etymology" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "closing" TEXT,
    "page" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Word_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Word_page_status_position_idx" ON "Word"("page", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Word_page_term_key" ON "Word"("page", "term");
