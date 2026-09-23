-- Phase 2: customer support tickets linked to orders + Sarhan conversation metadata.
-- Conversation remains on SupportTicketMessage (MessageThread is 1:1 user chat).

ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'AI_ASSISTING';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_CUSTOMER';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_SUPPORT';

DO $$ BEGIN
  CREATE TYPE "SupportHandlerMode" AS ENUM ('AI_ACTIVE', 'HUMAN_ACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupportMessageAuthor" AS ENUM ('CUSTOMER', 'SARHAN', 'STAFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "handlerMode" "SupportHandlerMode" NOT NULL DEFAULT 'HUMAN_ACTIVE',
  ADD COLUMN IF NOT EXISTS "orderId" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SupportTicket_orderId_idx" ON "SupportTicket"("orderId");
CREATE INDEX IF NOT EXISTS "SupportTicket_handlerMode_idx" ON "SupportTicket"("handlerMode");

DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "ButcherOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SupportTicketMessage"
  ADD COLUMN IF NOT EXISTS "authorKind" "SupportMessageAuthor" NOT NULL DEFAULT 'CUSTOMER';

ALTER TABLE "SupportTicketMessage" ALTER COLUMN "authorId" DROP NOT NULL;

UPDATE "SupportTicketMessage"
SET "authorKind" = 'STAFF'
WHERE "isStaffReply" = true AND "authorKind" = 'CUSTOMER';

DO $$ BEGIN
  ALTER TABLE "SupportTicketMessage" DROP CONSTRAINT "SupportTicketMessage_authorId_fkey";
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
