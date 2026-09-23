-- User name trigram indexes for search/suggest (pg_trgm already enabled)
CREATE INDEX IF NOT EXISTS "User_arabicName_trgm_idx"
  ON "User" USING gin ("arabicName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_displayName_trgm_idx"
  ON "User" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_username_trgm_idx"
  ON "User" USING gin (username gin_trgm_ops);
