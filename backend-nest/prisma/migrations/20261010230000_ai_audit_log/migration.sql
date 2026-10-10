-- Agent tool-attempt audit. No conversation text, no foreign keys.
-- Additive: new table only. Not applied by this commit.

CREATE TABLE IF NOT EXISTS "AiAuditLog" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "tool" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultSummary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiAuditLog_agent_createdAt_idx" ON "AiAuditLog"("agent", "createdAt");
