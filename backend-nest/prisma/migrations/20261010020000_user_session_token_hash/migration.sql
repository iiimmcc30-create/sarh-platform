-- Refresh-token hardening (additive only).
-- New sessions store SHA-256(refresh JWT) in "refreshToken"; existing plaintext
-- rows are still accepted and re-hashed on their next rotation (no forced logout).
-- "previousTokenHash" / "rotatedAt" back the 30s replay grace window.
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "previousTokenHash" TEXT;
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "rotatedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "UserSession_previousTokenHash_idx" ON "UserSession"("previousTokenHash");
