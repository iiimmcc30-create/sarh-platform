-- Per-user pin/hide for inbox. Existing threads stay visible (no backfill).
CREATE TABLE "MessageThreadState" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "MessageThreadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageThreadState_threadId_userId_key" ON "MessageThreadState"("threadId", "userId");
CREATE INDEX "MessageThreadState_userId_idx" ON "MessageThreadState"("userId");
CREATE INDEX "MessageThreadState_threadId_idx" ON "MessageThreadState"("threadId");

ALTER TABLE "MessageThreadState"
  ADD CONSTRAINT "MessageThreadState_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageThreadState"
  ADD CONSTRAINT "MessageThreadState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
