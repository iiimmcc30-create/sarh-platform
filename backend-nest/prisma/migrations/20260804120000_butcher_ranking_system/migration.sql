-- Butcher fair ranking system: scores, favorites, review updates

ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "completedOrdersCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "favoritesCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "avgAcceptMinutes" DOUBLE PRECISION;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "avgPrepMinutes" DOUBLE PRECISION;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "avgCompleteMinutes" DOUBLE PRECISION;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "rankingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "normalizedOrders" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "normalizedRating" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "normalizedFavorites" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "normalizedDistance" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "normalizedSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "newButcherBoost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Butcher" ADD COLUMN IF NOT EXISTS "lastRankingUpdate" TIMESTAMP(3);

ALTER TABLE "ButcherReview" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "ButcherReview" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Butcher_rankingScore_idx" ON "Butcher"("rankingScore");
CREATE INDEX IF NOT EXISTS "Butcher_completedOrdersCount_idx" ON "Butcher"("completedOrdersCount");
CREATE INDEX IF NOT EXISTS "Butcher_favoritesCount_idx" ON "Butcher"("favoritesCount");
CREATE INDEX IF NOT EXISTS "Butcher_createdAt_idx" ON "Butcher"("createdAt");
CREATE INDEX IF NOT EXISTS "Butcher_lat_lng_idx" ON "Butcher"("lat", "lng");
CREATE INDEX IF NOT EXISTS "ButcherReview_orderId_idx" ON "ButcherReview"("orderId");

CREATE TABLE IF NOT EXISTS "ButcherFavorite" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ButcherFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ButcherFavorite_butcherId_userId_key" ON "ButcherFavorite"("butcherId", "userId");
CREATE INDEX IF NOT EXISTS "ButcherFavorite_butcherId_idx" ON "ButcherFavorite"("butcherId");
CREATE INDEX IF NOT EXISTS "ButcherFavorite_userId_idx" ON "ButcherFavorite"("userId");

ALTER TABLE "ButcherFavorite" DROP CONSTRAINT IF EXISTS "ButcherFavorite_butcherId_fkey";
ALTER TABLE "ButcherFavorite" ADD CONSTRAINT "ButcherFavorite_butcherId_fkey"
  FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ButcherFavorite" DROP CONSTRAINT IF EXISTS "ButcherFavorite_userId_fkey";
ALTER TABLE "ButcherFavorite" ADD CONSTRAINT "ButcherFavorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill completed orders count from delivered orders
UPDATE "Butcher" b
SET "completedOrdersCount" = sub.cnt,
    "totalOrders" = sub.cnt
FROM (
  SELECT "butcherId", COUNT(*)::int AS cnt
  FROM "ButcherOrder"
  WHERE status = 'delivered'
  GROUP BY "butcherId"
) sub
WHERE b.id = sub."butcherId";
