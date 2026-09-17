import { prisma } from "@/lib/prisma";
import { NotificationSettingForm } from "@/components/admin/notification-setting-form";

export default async function AdminSettingsPage() {
  const settings = await prisma.notificationSetting.findFirst();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">通知設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          Google Chatへの通知を設定します。タレントが完了報告を送信すると、指定したスペースに通知が届きます。
        </p>
      </div>
      <NotificationSettingForm
        webhookUrl={settings?.googleChatWebhookUrl ?? ""}
        notifyOnReportSubmit={settings?.notifyOnReportSubmit ?? true}
      />
    </div>
  );
}
