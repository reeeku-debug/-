import { prisma } from "@/lib/prisma";

async function postToGoogleChat(webhookUrl: string, text: string) {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ text }),
  });
}

/**
 * タレントが完了報告を送信した時にGoogle Chatへ通知する。
 * 通知設定が未設定・OFFの場合は何もしない。送信失敗はメイン処理に影響させない（ベストエフォート）。
 */
export async function notifyReportSubmitted(params: {
  talentId: string;
  talentName: string;
  managementNo: string | null;
  stepTitle: string;
  origin: string;
}) {
  try {
    const settings = await prisma.notificationSetting.findFirst();
    if (!settings?.googleChatWebhookUrl || !settings.notifyOnReportSubmit) return;

    const noPart = params.managementNo ? `No.${params.managementNo} ` : "";
    const text =
      `📨 ${noPart}${params.talentName}さんが「${params.stepTitle}」の完了報告を送信しました。\n` +
      `確認: ${params.origin}/admin/talents/${params.talentId}`;

    await postToGoogleChat(settings.googleChatWebhookUrl, text);
  } catch {
    // 通知はベストエフォート。失敗してもタレントの報告送信自体は成功させる。
  }
}

/** マネージャーの通知設定画面から使う、疎通確認用のテスト送信。成否をそのまま返す。 */
export async function sendTestGoogleChatMessage(
  webhookUrl: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        text: "✅ VTuberロードマップ管理システムからのテスト通知です。この通知が届いていれば設定は正常です。",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        success: false,
        error: `送信に失敗しました（HTTP ${res.status}）${body ? ": " + body.slice(0, 200) : ""}`,
      };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "送信に失敗しました。" };
  }
}
