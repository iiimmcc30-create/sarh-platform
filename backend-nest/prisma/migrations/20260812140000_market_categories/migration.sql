-- AlterEnum: hierarchical market categories
ALTER TYPE "ListingCategory" ADD VALUE IF NOT EXISTS 'livestock';
ALTER TYPE "ListingCategory" ADD VALUE IF NOT EXISTS 'transport';
ALTER TYPE "ListingCategory" ADD VALUE IF NOT EXISTS 'slaughter';

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketCategory" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "emoji" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresWeight" BOOLEAN NOT NULL DEFAULT false,
    "legacyCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MarketCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketCategory_slug_key" ON "MarketCategory"("slug");
CREATE INDEX IF NOT EXISTS "MarketCategory_parentId_idx" ON "MarketCategory"("parentId");
CREATE INDEX IF NOT EXISTS "MarketCategory_isActive_sortOrder_idx" ON "MarketCategory"("isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "MarketCategory_deletedAt_idx" ON "MarketCategory"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "MarketCategory"
    ADD CONSTRAINT "MarketCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "MarketCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Listing market category FKs
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT;

CREATE INDEX IF NOT EXISTS "Listing_categoryId_idx" ON "Listing"("categoryId");
CREATE INDEX IF NOT EXISTS "Listing_subcategoryId_idx" ON "Listing"("subcategoryId");

DO $$ BEGIN
  ALTER TABLE "Listing"
    ADD CONSTRAINT "Listing_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "MarketCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Listing"
    ADD CONSTRAINT "Listing_subcategoryId_fkey"
    FOREIGN KEY ("subcategoryId") REFERENCES "MarketCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed taxonomy (fixed UUIDs for deterministic backfill)
INSERT INTO "MarketCategory" ("id", "nameAr", "nameEn", "slug", "icon", "emoji", "parentId", "sortOrder", "isActive", "requiresWeight", "legacyCategory", "createdAt", "updatedAt")
VALUES
  -- Parents
  ('a1000000-0000-4000-8000-000000000001', 'المواشي', 'Livestock', 'livestock', 'paw', '🐪', NULL, 0, true, false, 'livestock', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000002', 'الأعلاف', 'Feed', 'feed', 'leaf', '🌾', NULL, 1, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000003', 'النقل', 'Transport', 'transport', 'truck', '🚚', NULL, 2, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000004', 'الذبائح', 'Slaughter', 'slaughter', 'restaurant', '🥩', NULL, 3, true, true, 'slaughter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000005', 'المعدات', 'Equipment', 'equipment', 'construct', '🔧', NULL, 4, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Livestock children
  ('a2000000-0000-4000-8000-000000000001', 'إبل', 'Camels', 'camels', 'paw', '🐪', 'a1000000-0000-4000-8000-000000000001', 0, true, false, 'camels', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000002', 'أغنام', 'Sheep', 'sheep', 'paw', '🐑', 'a1000000-0000-4000-8000-000000000001', 1, true, false, 'sheep', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000003', 'ماعز', 'Goats', 'goats', 'paw', '🐐', 'a1000000-0000-4000-8000-000000000001', 2, true, false, 'goats', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000004', 'أبقار', 'Cows', 'cows', 'paw', '🐄', 'a1000000-0000-4000-8000-000000000001', 3, true, false, 'cows', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000005', 'خيول', 'Horses', 'horses', 'paw', '🐴', 'a1000000-0000-4000-8000-000000000001', 4, true, false, 'horses', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000006', 'دواجن', 'Birds', 'birds', 'paw', '🐓', 'a1000000-0000-4000-8000-000000000001', 5, true, false, 'birds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000007', 'أخرى', 'Other', 'livestock-other', 'paw', '📦', 'a1000000-0000-4000-8000-000000000001', 6, true, false, 'birds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Feed children
  ('a2000000-0000-4000-8000-000000000011', 'أعلاف مواشي', 'Livestock feed', 'livestock-feed', 'leaf', '🌾', 'a1000000-0000-4000-8000-000000000002', 0, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000012', 'شعير', 'Barley', 'barley', 'leaf', '🌾', 'a1000000-0000-4000-8000-000000000002', 1, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000013', 'تبن', 'Hay', 'hay', 'leaf', '🌾', 'a1000000-0000-4000-8000-000000000002', 2, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000014', 'برسيم', 'Clover', 'clover', 'leaf', '🍀', 'a1000000-0000-4000-8000-000000000002', 3, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000015', 'أعلاف مركزة', 'Concentrate', 'concentrate', 'leaf', '🥣', 'a1000000-0000-4000-8000-000000000002', 4, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000016', 'مكملات غذائية', 'Supplements', 'supplements', 'leaf', '💊', 'a1000000-0000-4000-8000-000000000002', 5, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000017', 'أخرى', 'Other', 'feed-other', 'leaf', '📦', 'a1000000-0000-4000-8000-000000000002', 6, true, false, 'feed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Transport children
  ('a2000000-0000-4000-8000-000000000021', 'نقل مواشي', 'Livestock transport', 'livestock-transport', 'truck', '🚚', 'a1000000-0000-4000-8000-000000000003', 0, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000022', 'نقل أعلاف', 'Feed transport', 'feed-transport', 'truck', '🚚', 'a1000000-0000-4000-8000-000000000003', 1, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000023', 'نقل مبرد', 'Cold transport', 'cold-transport', 'truck', '❄️', 'a1000000-0000-4000-8000-000000000003', 2, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000024', 'نقل عام', 'General transport', 'general-transport', 'truck', '🚛', 'a1000000-0000-4000-8000-000000000003', 3, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000025', 'سطحات وونش', 'Flatbed winch', 'flatbed-winch', 'truck', '🔧', 'a1000000-0000-4000-8000-000000000003', 4, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000026', 'أخرى', 'Other', 'transport-other', 'truck', '📦', 'a1000000-0000-4000-8000-000000000003', 5, true, false, 'transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Slaughter children
  ('a2000000-0000-4000-8000-000000000031', 'ذبائح أغنام', 'Sheep carcass', 'sheep-carcass', 'restaurant', '🥩', 'a1000000-0000-4000-8000-000000000004', 0, true, true, 'sheep', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000032', 'ذبائح ماعز', 'Goat carcass', 'goat-carcass', 'restaurant', '🥩', 'a1000000-0000-4000-8000-000000000004', 1, true, true, 'slaughter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000033', 'ذبائح إبل', 'Camel carcass', 'camel-carcass', 'restaurant', '🥩', 'a1000000-0000-4000-8000-000000000004', 2, true, true, 'slaughter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000034', 'ذبائح أبقار', 'Cow carcass', 'cow-carcass', 'restaurant', '🥩', 'a1000000-0000-4000-8000-000000000004', 3, true, true, 'slaughter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000035', 'ذبائح جاهزة', 'Ready carcass', 'ready-carcass', 'restaurant', '🥩', 'a1000000-0000-4000-8000-000000000004', 4, true, true, 'slaughter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000036', 'أخرى', 'Other', 'slaughter-other', 'restaurant', '📦', 'a1000000-0000-4000-8000-000000000004', 5, true, true, 'slaughter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Equipment children
  ('a2000000-0000-4000-8000-000000000041', 'حظائر', 'Pens', 'pens', 'construct', '🏠', 'a1000000-0000-4000-8000-000000000005', 0, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000042', 'معالف ومشارب', 'Feeders & drinkers', 'feeders-drinkers', 'construct', '🪣', 'a1000000-0000-4000-8000-000000000005', 1, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000043', 'معدات تربية', 'Breeding equipment', 'breeding-equipment', 'construct', '🔧', 'a1000000-0000-4000-8000-000000000005', 2, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000044', 'أدوات بيطرية', 'Vet tools', 'vet-tools', 'construct', '🩺', 'a1000000-0000-4000-8000-000000000005', 3, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000045', 'معدات قص وصوف', 'Shearing', 'shearing', 'construct', '✂️', 'a1000000-0000-4000-8000-000000000005', 4, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000046', 'معدات تحميل', 'Loading', 'loading', 'construct', '📦', 'a1000000-0000-4000-8000-000000000005', 5, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a2000000-0000-4000-8000-000000000047', 'أخرى', 'Other', 'equipment-other', 'construct', '📦', 'a1000000-0000-4000-8000-000000000005', 6, true, false, 'equipment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Backfill listings: livestock species → parent + matching child slug
UPDATE "Listing" AS l
SET
  "categoryId" = p.id,
  "subcategoryId" = c.id
FROM "MarketCategory" AS c
JOIN "MarketCategory" AS p ON p.id = c."parentId"
WHERE l."categoryId" IS NULL
  AND c.slug = l.category::text
  AND p.slug = 'livestock'
  AND l.category::text IN ('camels', 'sheep', 'goats', 'cows', 'horses', 'birds');

-- Backfill feed / equipment → parent only
UPDATE "Listing" AS l
SET "categoryId" = p.id
FROM "MarketCategory" AS p
WHERE l."categoryId" IS NULL
  AND p."parentId" IS NULL
  AND p.slug = l.category::text
  AND l.category::text IN ('feed', 'equipment');

-- Normalize equipment subcategory labels (idempotent)
UPDATE "MarketCategory" SET "nameAr" = 'معدات قص وصوف' WHERE slug = 'shearing';
UPDATE "MarketCategory" SET "nameAr" = 'معدات تحميل' WHERE slug = 'loading';
UPDATE "MarketCategory" SET emoji = '🐔' WHERE slug = 'birds';
UPDATE "MarketCategory" SET emoji = '🐎' WHERE slug = 'horses';
