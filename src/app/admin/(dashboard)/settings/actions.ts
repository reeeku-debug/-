"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { sendTestGoogleChatMessage } from "@/lib/notify";

type Result = { success: true } | { success: false; error: string };

export async function updateNotificationSettingAction(formData: FormData): Promise<Result> {
  await requireAdminSession();

  const googleChatWebhookUrl = (formData.get("googleChatWebhookUrl") as string | null)?.trim() || null;
  const notifyOnReportSubmit = formData.get("notifyOnReportSubmit") === "on";
  const dailyDigestEnabled = formData.get("dailyDigestEnabled") === "on";

  const existing = await prisma.notificationSetting.findFirst();
  if (existing) {
    await prisma.notificationSetting.update({
      where: { id: existing.id },
      data: { googleChatWebhookUrl, notifyOnReportSubmit, dailyDigestEnabled },
    });
  } else {
    await prisma.notificationSetting.create({
      data: { googleChatWebhookUrl, notifyOnReportSubmit, dailyDigestEnabled },
    });
  }

  revalidatePath("/admin/settings");
  return { success: true };
}

export async function sendTestNotificationAction(webhookUrl: string): Promise<Result> {
  await requireAdminSession();

  const url = webhookUrl.trim();
  if (!url) {
    return { success: false, error: "Webhook URLを入力してください。" };
  }
  return sendTestGoogleChatMessage(url);
}
