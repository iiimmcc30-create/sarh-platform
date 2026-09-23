-- CreateEnum
CREATE TYPE "DaftraIntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'CONNECTION_FAILED', 'DISABLED');

-- CreateTable
CREATE TABLE "ButcherDaftraIntegration" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "accountIdentifier" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT NOT NULL,
    "apiKeyIv" TEXT NOT NULL,
    "apiKeyTag" TEXT NOT NULL,
    "apiKeyLast4" TEXT NOT NULL,
    "status" "DaftraIntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastConnectionTestAt" TIMESTAMP(3),
    "lastConnectionError" TEXT,
    "daftraLoginEmail" TEXT,
    "daftraLoginUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherDaftraIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ButcherDaftraIntegration_butcherId_key" ON "ButcherDaftraIntegration"("butcherId");

-- CreateIndex
CREATE INDEX "ButcherDaftraIntegration_status_idx" ON "ButcherDaftraIntegration"("status");

-- AddForeignKey
ALTER TABLE "ButcherDaftraIntegration" ADD CONSTRAINT "ButcherDaftraIntegration_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
