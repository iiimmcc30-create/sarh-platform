-- Enable trigram extension for faster ILIKE / similarity search (safe if already exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Listing marketplace search
CREATE INDEX IF NOT EXISTS "Listing_arabicTitle_trgm_idx"
  ON "Listing" USING gin ("arabicTitle" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Listing_title_trgm_idx"
  ON "Listing" USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Listing_arabicLocation_trgm_idx"
  ON "Listing" USING gin ("arabicLocation" gin_trgm_ops);

-- Butcher discovery
CREATE INDEX IF NOT EXISTS "Butcher_nameAr_trgm_idx"
  ON "Butcher" USING gin ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Butcher_cityAr_trgm_idx"
  ON "Butcher" USING gin ("cityAr" gin_trgm_ops);

-- Posts & editorial content
CREATE INDEX IF NOT EXISTS "Post_arabicContent_trgm_idx"
  ON "Post" USING gin ("arabicContent" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EditorialStory_titleAr_trgm_idx"
  ON "EditorialStory" USING gin ("titleAr" gin_trgm_ops);

-- Official services (lowercase table name mapped from Prisma)
CREATE INDEX IF NOT EXISTS "services_title_trgm_idx"
  ON services USING gin (title gin_trgm_ops);
