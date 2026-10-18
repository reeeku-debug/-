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

/**
 * タレントがスタンプ獲得を申請した時にGoogle Chatへ通知する。
 * 通知設定が未設定・OFFの場合は何もしない。送信失敗はメイン処理に影響させない（ベストエフォート）。
 */
export async function notifyStampClaimSubmitted(params: {
  talentId: string;
  talentName: string;
  managementNo: string | null;
  stampTitle: string;
  origin: string;
}) {
  try {
    const settings = await prisma.notificationSetting.findFirst();
    if (!settings?.googleChatWebhookUrl || !settings.notifyOnReportSubmit) return;

    const noPart = params.managementNo ? `No.${params.managementNo} ` : "";
    const text =
      `🎖️ ${noPart}${params.talentName}さんがスタンプ「${params.stampTitle}」を申請しました。\n` +
      `確認: ${params.origin}/admin/stamps`;

    await postToGoogleChat(settings.googleChatWebhookUrl, text);
  } catch {
    // 通知はベストエフォート。失敗してもタレントの申請自体は成功させる。
  }
}

/**
 * 未承認（PENDING）の完了報告をまとめて1通のGoogle Chatメッセージで通知する。
 * 毎日13時のcronジョブから呼ばれる。対象が0件、またはWebhook未設定/OFFの場合は送信しない。
 */
export async function sendPendingReportsDigest(origin: string): Promise<{ sent: boolean; count: number }> {
  const settings = await prisma.notificationSetting.findFirst();
  if (!settings?.googleChatWebhookUrl || !settings.dailyDigestEnabled) {
    return { sent: false, count: 0 };
  }

  const [pendingReports, pendingClaims] = await Promise.all([
    prisma.stepReport.findMany({
      where: { status: "PENDING" },
      orderBy: { submittedAt: "asc" },
      include: { talent: true, stepTemplate: true },
    }),
    prisma.stampClaim.findMany({
      where: { status: "PENDING" },
      orderBy: { submittedAt: "asc" },
      include: { talent: true, stampItem: true },
    }),
  ]);
  const total = pendingReports.length + pendingClaims.length;
  if (total === 0) {
    return { sent: false, count: 0 };
  }

  const reportLines = pendingReports.map((r) => {
    const noPart = r.talent.managementNo ? `No.${r.talent.managementNo} ` : "";
    return `・${noPart}${r.talent.name}さん - 「${r.stepTemplate.title}」`;
  });
  const claimLines = pendingClaims.map((c) => {
    const noPart = c.talent.managementNo ? `No.${c.talent.managementNo} ` : "";
    return `・${noPart}${c.talent.name}さん - 🎖️「${c.stampItem.title}」`;
  });

  const sections: string[] = [];
  if (reportLines.length > 0) {
    sections.push(`【完了報告】${reportLines.length}件\n` + reportLines.join("\n"));
  }
  if (claimLines.length > 0) {
    sections.push(`【スタンプ申請】${claimLines.length}件\n` + claimLines.join("\n"));
  }

  const text =
    `🔔 未承認の申請が ${total} 件あります\n\n` +
    sections.join("\n\n") +
    `\n\n確認: ${origin}/admin/reports ／ ${origin}/admin/stamps`;

  await postToGoogleChat(settings.googleChatWebhookUrl, text);
  return { sent: true, count: total };
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
