-- AlterTable
ALTER TABLE "User" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "commentsAudience" TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN "privateMessagesAudience" TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
