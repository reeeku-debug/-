-- CreateTable
CREATE TABLE "StepPattern" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepPattern_pkey" PRIMARY KEY ("id")
);

-- Seed a default pattern and backfill existing data into it
INSERT INTO "StepPattern" ("id", "name", "description", "isDefault", "createdAt", "updatedAt")
VALUES ('default_step_pattern', 'デフォルト', '初期からある標準のロードマップ', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: StepTemplate (add patternId, backfill, then enforce NOT NULL)
ALTER TABLE "StepTemplate" ADD COLUMN "patternId" TEXT;
UPDATE "StepTemplate" SET "patternId" = 'default_step_pattern';
ALTER TABLE "StepTemplate" ALTER COLUMN "patternId" SET NOT NULL;

-- AlterTable: Talent (add patternId, backfill, then enforce NOT NULL)
ALTER TABLE "Talent" ADD COLUMN "patternId" TEXT;
UPDATE "Talent" SET "patternId" = 'default_step_pattern';
ALTER TABLE "Talent" ALTER COLUMN "patternId" SET NOT NULL;

-- DropIndex (old global-unique key, replaced by per-pattern unique)
DROP INDEX "StepTemplate_key_key";
DROP INDEX "StepTemplate_order_idx";

-- CreateIndex
CREATE UNIQUE INDEX "StepTemplate_patternId_key_key" ON "StepTemplate"("patternId", "key");
CREATE INDEX "StepTemplate_patternId_order_idx" ON "StepTemplate"("patternId", "order");

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "StepPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Talent" ADD CONSTRAINT "Talent_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "StepPattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
