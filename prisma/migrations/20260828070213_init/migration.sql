-- CreateTable
CREATE TABLE "Registrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submitter" TEXT NOT NULL,
    "realityUrl" TEXT NOT NULL,
    "realityId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Registrant_realityId_key" ON "Registrant"("realityId");

-- CreateIndex
CREATE INDEX "Registrant_createdAt_idx" ON "Registrant"("createdAt");
