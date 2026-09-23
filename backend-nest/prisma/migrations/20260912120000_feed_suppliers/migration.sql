-- CreateEnum
CREATE TYPE "FeedProductCategory" AS ENUM ('livestock', 'sheep', 'camels', 'poultry', 'hay', 'barley');

-- CreateTable
CREATE TABLE "FeedSupplier" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "logo" TEXT,
    "cover" TEXT,
    "description" TEXT,
    "cityAr" TEXT NOT NULL,
    "districtAr" TEXT,
    "addressAr" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "whatsapp" TEXT,
    "hoursAr" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT,
    "category" "FeedProductCategory" NOT NULL,
    "imageUrl" TEXT,
    "weightLabel" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedSupplier_deletedAt_idx" ON "FeedSupplier"("deletedAt");
CREATE INDEX "FeedSupplier_published_deletedAt_idx" ON "FeedSupplier"("published", "deletedAt");
CREATE INDEX "FeedSupplier_cityAr_idx" ON "FeedSupplier"("cityAr");
CREATE INDEX "FeedProduct_supplierId_published_idx" ON "FeedProduct"("supplierId", "published");
CREATE INDEX "FeedProduct_deletedAt_idx" ON "FeedProduct"("deletedAt");
CREATE INDEX "FeedProduct_category_idx" ON "FeedProduct"("category");

ALTER TABLE "FeedProduct" ADD CONSTRAINT "FeedProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "FeedSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
