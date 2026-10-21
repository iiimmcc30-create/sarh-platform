-- Reviews become immutable comments. Existing star-only rows stay as reviews
-- with an empty comment and a null oath. Those rows count by stars: 4–5 are
-- positive (recommend = true), 1–2 are negative, and 3 stays neutral. Every
-- non-hidden row, including a neutral 3, stays in the star average.

ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "comment" VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "purchased" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "recommend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "oathAcceptedAt" TIMESTAMP(3);
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "hiddenReason" VARCHAR(500);
ALTER TABLE "UserReview" ADD COLUMN IF NOT EXISTS "hiddenById" TEXT;

CREATE INDEX IF NOT EXISTS "UserReview_targetId_hiddenAt_createdAt_idx"
  ON "UserReview"("targetId", "hiddenAt", "createdAt");
CREATE INDEX IF NOT EXISTS "UserReview_hiddenAt_idx" ON "UserReview"("hiddenAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserReview_hiddenById_fkey') THEN
    ALTER TABLE "UserReview" ADD CONSTRAINT "UserReview_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserReview_rating_range') THEN
    ALTER TABLE "UserReview" ADD CONSTRAINT "UserReview_rating_range"
      CHECK (rating >= 1 AND rating <= 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserReview_comment_len') THEN
    ALTER TABLE "UserReview" ADD CONSTRAINT "UserReview_comment_len"
      CHECK (char_length(comment) <= 1000);
  END IF;
END $$;

-- Content columns cannot change and rows cannot be deleted. Hide-only updates
-- (hiddenAt, hiddenReason, hiddenById, updatedAt) are allowed.
CREATE OR REPLACE FUNCTION user_review_guard_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user reviews cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.purchased IS DISTINCT FROM OLD.purchased
       OR NEW.recommend IS DISTINCT FROM OLD.recommend
       OR NEW."oathAcceptedAt" IS DISTINCT FROM OLD."oathAcceptedAt"
       OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
       OR NEW."reviewerId" IS DISTINCT FROM OLD."reviewerId"
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'user review content is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop first so a re-run can backfill recommend before the trigger locks it.
DROP TRIGGER IF EXISTS user_review_guard_immutable ON "UserReview";

-- Star-only rows: 4–5 recommend (positive). 1–3 stay recommend = false.
-- Counts still treat only 1–2 as negative and leave 3 out of both totals.
UPDATE "UserReview"
SET "recommend" = true
WHERE "comment" = ''
  AND "oathAcceptedAt" IS NULL
  AND rating >= 4;

UPDATE "UserReview"
SET "recommend" = false
WHERE "comment" = ''
  AND "oathAcceptedAt" IS NULL
  AND rating <= 3;

CREATE TRIGGER user_review_guard_immutable
  BEFORE UPDATE OR DELETE ON "UserReview"
  FOR EACH ROW EXECUTE FUNCTION user_review_guard_immutable();
