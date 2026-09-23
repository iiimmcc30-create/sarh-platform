-- Support & Help system: tickets threading, verification requests, FAQs

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'AWAITING_USER';

-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('SUPPORT', 'REPORT');
CREATE TYPE "AccountVerificationStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'NEEDS_AMENDMENTS', 'VERIFIED', 'REJECTED');
CREATE TYPE "AccountVerificationDocumentType" AS ENUM ('NATIONAL_ID', 'COMMERCIAL_REGISTER', 'OTHER');
CREATE TYPE "FaqCategory" AS ENUM ('ACCOUNT', 'ADS', 'MARKET', 'BUY_SELL', 'PAYMENT', 'VERIFICATION', 'BUTCHERS', 'TECHNICAL', 'GENERAL');

-- AlterTable SupportTicket
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "type" "SupportTicketType" NOT NULL DEFAULT 'SUPPORT';
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;

CREATE INDEX IF NOT EXISTS "SupportTicket_type_idx" ON "SupportTicket"("type");
CREATE INDEX IF NOT EXISTS "SupportTicket_reporterId_idx" ON "SupportTicket"("reporterId");
CREATE INDEX IF NOT EXISTS "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");

DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable SupportTicketMessage
CREATE TABLE IF NOT EXISTS "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isStaffReply" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicketMessage_ticketId_idx" ON "SupportTicketMessage"("ticketId");
CREATE INDEX IF NOT EXISTS "SupportTicketMessage_authorId_idx" ON "SupportTicketMessage"("authorId");
CREATE INDEX IF NOT EXISTS "SupportTicketMessage_createdAt_idx" ON "SupportTicketMessage"("createdAt");

DO $$ BEGIN
  ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable SupportTicketAttachment
CREATE TABLE IF NOT EXISTS "SupportTicketAttachment" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "messageId" TEXT,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicketAttachment_ticketId_idx" ON "SupportTicketAttachment"("ticketId");
CREATE INDEX IF NOT EXISTS "SupportTicketAttachment_messageId_idx" ON "SupportTicketAttachment"("messageId");

DO $$ BEGIN
  ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable AccountVerificationRequest
CREATE TABLE IF NOT EXISTS "AccountVerificationRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccountVerificationStatus" NOT NULL DEFAULT 'DRAFT',
  "fullName" TEXT,
  "nationalId" TEXT,
  "businessName" TEXT,
  "businessType" TEXT,
  "additionalInfo" TEXT,
  "reviewReason" TEXT,
  "adminNotes" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountVerificationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountVerificationRequest_userId_key" ON "AccountVerificationRequest"("userId");
CREATE INDEX IF NOT EXISTS "AccountVerificationRequest_status_idx" ON "AccountVerificationRequest"("status");
CREATE INDEX IF NOT EXISTS "AccountVerificationRequest_submittedAt_idx" ON "AccountVerificationRequest"("submittedAt");

DO $$ BEGIN
  ALTER TABLE "AccountVerificationRequest" ADD CONSTRAINT "AccountVerificationRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AccountVerificationRequest" ADD CONSTRAINT "AccountVerificationRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable AccountVerificationDocument
CREATE TABLE IF NOT EXISTS "AccountVerificationDocument" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "type" "AccountVerificationDocumentType" NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "originalFileName" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountVerificationDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountVerificationDocument_requestId_idx" ON "AccountVerificationDocument"("requestId");

DO $$ BEGIN
  ALTER TABLE "AccountVerificationDocument" ADD CONSTRAINT "AccountVerificationDocument_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "AccountVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable AccountVerificationTimelineEvent
CREATE TABLE IF NOT EXISTS "AccountVerificationTimelineEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountVerificationTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountVerificationTimelineEvent_requestId_idx" ON "AccountVerificationTimelineEvent"("requestId");
CREATE INDEX IF NOT EXISTS "AccountVerificationTimelineEvent_createdAt_idx" ON "AccountVerificationTimelineEvent"("createdAt");

DO $$ BEGIN
  ALTER TABLE "AccountVerificationTimelineEvent" ADD CONSTRAINT "AccountVerificationTimelineEvent_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "AccountVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable Faq
CREATE TABLE IF NOT EXISTS "Faq" (
  "id" TEXT NOT NULL,
  "questionAr" TEXT NOT NULL,
  "answerAr" TEXT NOT NULL,
  "category" "FaqCategory" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Faq_category_idx" ON "Faq"("category");
CREATE INDEX IF NOT EXISTS "Faq_isActive_idx" ON "Faq"("isActive");
CREATE INDEX IF NOT EXISTS "Faq_sortOrder_idx" ON "Faq"("sortOrder");
CREATE INDEX IF NOT EXISTS "Faq_deletedAt_idx" ON "Faq"("deletedAt");

-- Mark existing tickets as REPORT type
UPDATE "SupportTicket" SET "type" = 'REPORT' WHERE "category" = 'REPORT';
