-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "legacyNo" INTEGER,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewNote" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Talent_companyId_legacyNo_key" ON "Talent"("companyId", "legacyNo");

