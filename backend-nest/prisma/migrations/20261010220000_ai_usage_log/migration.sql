-- AI usage counters only. No prompts, replies, or customer text.
-- Additive: new table, no change to existing tables. Not applied by this commit.

CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiUsageLog_agent_createdAt_idx" ON "AiUsageLog"("agent", "createdAt");
CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
