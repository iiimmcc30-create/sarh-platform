-- CreateTable
CREATE TABLE IF NOT EXISTS "ExploreSarhBanner" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "accessibilityLabel" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExploreSarhBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExploreSarhBanner_isActive_sortOrder_idx"
  ON "ExploreSarhBanner"("isActive", "sortOrder");
