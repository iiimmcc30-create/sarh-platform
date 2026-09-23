-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('ni');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('pending', 'processing', 'synced', 'failed', 'retrying', 'cancelled');

-- CreateTable
CREATE TABLE "IntegrationOrder" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL DEFAULT 'ni',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'pending',
    "merchantOrderReference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "externalReference" TEXT,
    "checkoutUrl" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventName" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOrder_paymentId_key" ON "IntegrationOrder"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOrder_idempotencyKey_key" ON "IntegrationOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IntegrationOrder_provider_status_idx" ON "IntegrationOrder"("provider", "status");

-- CreateIndex
CREATE INDEX "IntegrationOrder_externalOrderId_idx" ON "IntegrationOrder"("externalOrderId");

-- CreateIndex
CREATE INDEX "IntegrationOrder_merchantOrderReference_idx" ON "IntegrationOrder"("merchantOrderReference");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookEvent_provider_eventKey_key" ON "IntegrationWebhookEvent"("provider", "eventKey");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_paymentId_idx" ON "IntegrationWebhookEvent"("paymentId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_createdAt_idx" ON "IntegrationWebhookEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationOrder" ADD CONSTRAINT "IntegrationOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
