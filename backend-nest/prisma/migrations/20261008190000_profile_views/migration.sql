-- «مين شاف ملفي» (who viewed my profile): one new table only. No existing
-- table is altered. One row per viewer per profile per UTC day (latest view
-- time); the API lists the last 30 days to Blue / Blue+ / Gold subscribers.
-- Re-runnable (IF NOT EXISTS / guarded DO blocks).

CREATE TABLE IF NOT EXISTS "ProfileView" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProfileView_profileId_viewerId_day_key" ON "ProfileView"("profileId", "viewerId", "day");
CREATE INDEX IF NOT EXISTS "ProfileView_profileId_viewedAt_idx" ON "ProfileView"("profileId", "viewedAt");
CREATE INDEX IF NOT EXISTS "ProfileView_viewerId_idx" ON "ProfileView"("viewerId");

DO $$ BEGIN
  ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
