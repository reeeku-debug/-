-- AlterTable
ALTER TABLE "StepTemplate" ADD COLUMN     "goalNote" TEXT;

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "googleChatWebhookUrl" TEXT,
    "notifyOnReportSubmit" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);
