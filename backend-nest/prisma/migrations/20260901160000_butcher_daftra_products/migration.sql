-- CreateTable
CREATE TABLE "ButcherDaftraProduct" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "sarhProductId" TEXT,
    "daftraProductId" INTEGER NOT NULL,
    "daftraProductCode" TEXT,
    "lastKnownQuantity" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherDaftraProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ButcherDaftraProduct_sarhProductId_key" ON "ButcherDaftraProduct"("sarhProductId");

-- CreateIndex
CREATE INDEX "ButcherDaftraProduct_butcherId_idx" ON "ButcherDaftraProduct"("butcherId");

-- CreateIndex
CREATE UNIQUE INDEX "ButcherDaftraProduct_butcherId_daftraProductId_key" ON "ButcherDaftraProduct"("butcherId", "daftraProductId");

-- AddForeignKey
ALTER TABLE "ButcherDaftraProduct" ADD CONSTRAINT "ButcherDaftraProduct_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherDaftraProduct" ADD CONSTRAINT "ButcherDaftraProduct_sarhProductId_fkey" FOREIGN KEY ("sarhProductId") REFERENCES "ButcherProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
