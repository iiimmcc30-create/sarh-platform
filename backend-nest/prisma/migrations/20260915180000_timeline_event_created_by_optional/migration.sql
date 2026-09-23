-- Allow automated timeline rows (e.g. Daftra product poll) without a User FK.
ALTER TABLE "ButcherApplicationTimelineEvent" ALTER COLUMN "createdBy" DROP NOT NULL;
