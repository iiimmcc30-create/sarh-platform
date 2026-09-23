-- Multi-device FCM tokens. Legacy User.fcmToken is backfilled and kept as last-seen.
CREATE TABLE "UserDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDeviceToken_token_key" ON "UserDeviceToken"("token");
CREATE INDEX "UserDeviceToken_userId_idx" ON "UserDeviceToken"("userId");

ALTER TABLE "UserDeviceToken"
  ADD CONSTRAINT "UserDeviceToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserDeviceToken" ("id", "userId", "token", "createdAt", "updatedAt", "lastSeenAt")
SELECT gen_random_uuid()::text,
       u.id,
       u."fcmToken",
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "User" u
WHERE u."fcmToken" IS NOT NULL
  AND btrim(u."fcmToken") <> ''
ON CONFLICT ("token") DO NOTHING;
