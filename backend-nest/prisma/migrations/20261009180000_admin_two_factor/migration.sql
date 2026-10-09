-- Optional TOTP two-factor auth for admin-panel staff.
-- Additive only, no existing data touched, re-runnable.
-- Until applied, admin login keeps working without 2FA (P2021 is tolerated).

CREATE TABLE IF NOT EXISTS "AdminTwoFactor" (
    "userId" TEXT NOT NULL,
    "secretSealed" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTwoFactor_pkey" PRIMARY KEY ("userId")
);

DO $$ BEGIN
  ALTER TABLE "AdminTwoFactor" ADD CONSTRAINT "AdminTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
