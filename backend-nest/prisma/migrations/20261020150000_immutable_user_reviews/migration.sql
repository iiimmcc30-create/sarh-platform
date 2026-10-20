-- Immutable account reviews: comment, purchase/recommend answers, oath time,
-- and a one-way hide for staff. Existing star-only rows stay (empty comment).
-- A 4–5 star legacy row counts as a recommendation so thumbs totals stay
-- aligned with the stored average. New reviews always set oathAcceptedAt.

ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "comment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "purchased" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "recommend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "oathAcceptedAt" TIMESTAMP(3);
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "hiddenReason" TEXT;
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "hiddenById" TEXT;

UPDATE "UserReview"
SET "recommend" = ("rating" >= 4)
WHERE "oathAcceptedAt" IS NULL
  AND "comment" = '';

CREATE INDEX IF NOT EXISTS "UserReview_targetId_hiddenAt_createdAt_idx"
  ON "UserReview"("targetId", "hiddenAt", "createdAt");
CREATE INDEX IF NOT EXISTS "UserReview_hiddenAt_idx" ON "UserReview"("hiddenAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserReview_hiddenById_fkey') THEN
    ALTER TABLE "UserReview" ADD CONSTRAINT "UserReview_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Content columns are frozen. Hide columns may be set once. DELETE is rejected.
CREATE OR REPLACE FUNCTION user_review_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user_review_immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
     OR NEW."reviewerId" IS DISTINCT FROM OLD."reviewerId"
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.purchased IS DISTINCT FROM OLD.purchased
     OR NEW.recommend IS DISTINCT FROM OLD.recommend
     OR NEW."oathAcceptedAt" IS DISTINCT FROM OLD."oathAcceptedAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'user_review_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD."hiddenAt" IS NOT NULL AND (
       NEW."hiddenAt" IS DISTINCT FROM OLD."hiddenAt"
    OR NEW."hiddenReason" IS DISTINCT FROM OLD."hiddenReason"
    OR NEW."hiddenById" IS DISTINCT FROM OLD."hiddenById"
  ) THEN
    RAISE EXCEPTION 'user_review_hide_final' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_review_no_delete ON "UserReview";
CREATE TRIGGER user_review_no_delete
  BEFORE DELETE ON "UserReview"
  FOR EACH ROW EXECUTE FUNCTION user_review_guard();

DROP TRIGGER IF EXISTS user_review_no_edit ON "UserReview";
CREATE TRIGGER user_review_no_edit
  BEFORE UPDATE ON "UserReview"
  FOR EACH ROW EXECUTE FUNCTION user_review_guard();
