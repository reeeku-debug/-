-- CreateTable
CREATE TABLE "StampItem" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '⭐',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StampItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampClaim" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "stampItemId" TEXT NOT NULL,
    "comment" TEXT,
    "imageUrl" TEXT,
    "relatedUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewComment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "StampClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StampItem_order_idx" ON "StampItem"("order");

-- CreateIndex
CREATE INDEX "StampClaim_talentId_idx" ON "StampClaim"("talentId");

-- CreateIndex
CREATE INDEX "StampClaim_stampItemId_idx" ON "StampClaim"("stampItemId");

-- CreateIndex
CREATE INDEX "StampClaim_status_idx" ON "StampClaim"("status");

-- AddForeignKey
ALTER TABLE "StampClaim" ADD CONSTRAINT "StampClaim_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampClaim" ADD CONSTRAINT "StampClaim_stampItemId_fkey" FOREIGN KEY ("stampItemId") REFERENCES "StampItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampClaim" ADD CONSTRAINT "StampClaim_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
