-- CreateTable
CREATE TABLE IF NOT EXISTS "ButcherMarketBanner" (
    "id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "titleAr" TEXT NOT NULL,
    "subtitleAr" TEXT NOT NULL,
    "captionAr" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ButcherMarketBanner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ButcherMarketBanner_slot_key" ON "ButcherMarketBanner"("slot");
CREATE INDEX IF NOT EXISTS "ButcherMarketBanner_isActive_slot_idx" ON "ButcherMarketBanner"("isActive", "slot");

INSERT INTO "ButcherMarketBanner" ("id", "slot", "titleAr", "subtitleAr", "captionAr", "imageUrl", "isActive", "createdAt", "updatedAt")
VALUES
  ('butcher-banner-slot-1', 1, 'لحوم، دواجن، ومأكولات بحرية', 'كل اللي تحتاجه في سوق الملاحم', 'طازج، موثوق، وسهل الطلب', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=1400&q=80', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('butcher-banner-slot-2', 2, 'ملاحم موثّقة قريبة منك', 'اطلب واستلم من الملحمة أو إلى بابك', 'عروض يومية على الذبائح الطازجة', 'https://images.unsplash.com/photo-1558030006-450675393462?w=1400&q=80', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('butcher-banner-slot-3', 3, 'تسوق بثقة مع سرح', 'ادفع بسهولة وتابع طلبك لحظة بلحظة', 'تجربة سلسة من الطلب حتى الاستلام', 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=1400&q=80', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slot") DO NOTHING;
