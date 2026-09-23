-- Separate butcher-account credentials stored on the application until approve.
ALTER TABLE "ButcherApplication" ADD COLUMN "accountUsername" TEXT;
ALTER TABLE "ButcherApplication" ADD COLUMN "accountEmail" TEXT;
ALTER TABLE "ButcherApplication" ADD COLUMN "accountPasswordHash" TEXT;
