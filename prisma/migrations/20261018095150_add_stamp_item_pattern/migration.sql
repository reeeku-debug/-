-- AlterTable: StampItem (add patternId, backfill to default pattern, then enforce NOT NULL)
ALTER TABLE "StampItem" ADD COLUMN "patternId" TEXT;

UPDATE "StampItem"
SET "patternId" = (SELECT "id" FROM "StepPattern" WHERE "isDefault" = true LIMIT 1);

ALTER TABLE "StampItem" ALTER COLUMN "patternId" SET NOT NULL;

-- DropIndex (old global-order index, replaced by per-pattern index)
DROP INDEX "StampItem_order_idx";

-- CreateIndex
CREATE INDEX "StampItem_patternId_order_idx" ON "StampItem"("patternId", "order");

-- AddForeignKey
ALTER TABLE "StampItem" ADD CONSTRAINT "StampItem_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "StepPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
