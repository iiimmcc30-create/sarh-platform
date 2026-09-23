-- AlterEnum
CREATE TYPE "DaftraAuthMethod" AS ENUM ('API_KEY', 'OAUTH', 'BOTH');

-- AlterTable: API key becomes optional so OAuth-only connections are allowed.
ALTER TABLE "ButcherDaftraIntegration"
  ALTER COLUMN "apiKeyCiphertext" DROP NOT NULL,
  ALTER COLUMN "apiKeyIv" DROP NOT NULL,
  ALTER COLUMN "apiKeyTag" DROP NOT NULL,
  ALTER COLUMN "apiKeyLast4" DROP NOT NULL;

ALTER TABLE "ButcherDaftraIntegration"
  ADD COLUMN "authMethod" "DaftraAuthMethod" NOT NULL DEFAULT 'API_KEY',
  ADD COLUMN "oauthProvider" TEXT,
  ADD COLUMN "accessTokenCiphertext" TEXT,
  ADD COLUMN "accessTokenIv" TEXT,
  ADD COLUMN "accessTokenTag" TEXT,
  ADD COLUMN "refreshTokenCiphertext" TEXT,
  ADD COLUMN "refreshTokenIv" TEXT,
  ADD COLUMN "refreshTokenTag" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "oauthScopes" TEXT,
  ADD COLUMN "oauthConnectedAt" TIMESTAMP(3);

CREATE INDEX "ButcherDaftraIntegration_oauthProvider_idx" ON "ButcherDaftraIntegration"("oauthProvider");
