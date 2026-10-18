-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Talent" (
    "id" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activityName" TEXT,
    "firstStreamDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Talent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTemplate" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '✅',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "buttonLabel" TEXT NOT NULL DEFAULT '完了報告を送る',
    "type" TEXT NOT NULL DEFAULT 'NORMAL',
    "requiresReport" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentStepStatus" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "stepTemplateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "clearedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentStepStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepReport" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "stepTemplateId" TEXT NOT NULL,
    "comment" TEXT,
    "imageUrl" TEXT,
    "relatedUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewComment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "StepReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Talent_loginId_key" ON "Talent"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "Talent_slug_key" ON "Talent"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StepTemplate_key_key" ON "StepTemplate"("key");

-- CreateIndex
CREATE INDEX "StepTemplate_order_idx" ON "StepTemplate"("order");

-- CreateIndex
CREATE INDEX "TalentStepStatus_talentId_idx" ON "TalentStepStatus"("talentId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentStepStatus_talentId_stepTemplateId_key" ON "TalentStepStatus"("talentId", "stepTemplateId");

-- CreateIndex
CREATE INDEX "StepReport_talentId_idx" ON "StepReport"("talentId");

-- CreateIndex
CREATE INDEX "StepReport_status_idx" ON "StepReport"("status");

-- AddForeignKey
ALTER TABLE "TalentStepStatus" ADD CONSTRAINT "TalentStepStatus_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentStepStatus" ADD CONSTRAINT "TalentStepStatus_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "StepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepReport" ADD CONSTRAINT "StepReport_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepReport" ADD CONSTRAINT "StepReport_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "StepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepReport" ADD CONSTRAINT "StepReport_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
