-- «القريب منك»: Saudi city reference table + approximate listing coordinates.
-- Additive only, no existing data touched, re-runnable.
--   1) "SaudiCity" table (seeded at boot from assets/geo/saudi-cities.json).
--   2) "ListingGeoSource" enum (CITY | GPS).
--   3) "Listing"."lat", "lng", "cityId" (FK → SaudiCity, ON DELETE SET NULL), "geoSource".
--   4) Indexes on "Listing"("lat","lng") and "Listing"("cityId").

CREATE TABLE IF NOT EXISTS "SaudiCity" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "aliases" TEXT[],
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaudiCity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaudiCity_regionId_idx" ON "SaudiCity"("regionId");

DO $$ BEGIN
  CREATE TYPE "ListingGeoSource" AS ENUM ('CITY', 'GPS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "cityId" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "geoSource" "ListingGeoSource";

CREATE INDEX IF NOT EXISTS "Listing_lat_lng_idx" ON "Listing"("lat", "lng");
CREATE INDEX IF NOT EXISTS "Listing_cityId_idx" ON "Listing"("cityId");

DO $$ BEGIN
  ALTER TABLE "Listing" ADD CONSTRAINT "Listing_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "SaudiCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
