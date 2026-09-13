"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { submitReport } from "@/lib/progress";
import { saveUploadedImage } from "@/lib/upload";

type ActionResult = { success: true } | { success: false; error: string };

/**
 * タレントによる完了報告の送信。
 * 専用URL（slug）自体がアクセストークンとして機能するため、ログインセッションは
 * 要求しない。slugからタレントを一意に特定し、そのtalentIdのみを使って更新する
 * （フォームから直接talentIdを受け取ることはない）。
 */
export async function submitStepReportAction(formData: FormData): Promise<ActionResult> {
  const slug = formData.get("slug");
  const stepTemplateId = formData.get("stepTemplateId");
  if (typeof slug !== "string" || !slug || typeof stepTemplateId !== "string" || !stepTemplateId) {
    return { success: false, error: "不正なリクエストです。" };
  }

  const talent = await prisma.talent.findUnique({ where: { slug } });
  if (!talent) {
    return { success: false, error: "不正なリクエストです。" };
  }

  const commentRaw = formData.get("comment");
  const relatedUrlRaw = formData.get("relatedUrl");
  const comment = typeof commentRaw === "string" && commentRaw.trim() ? commentRaw.trim() : undefined;
  const relatedUrl =
    typeof relatedUrlRaw === "string" && relatedUrlRaw.trim() ? relatedUrlRaw.trim() : undefined;
  const imageFile = formData.get("image");

  try {
    let imageUrl: string | undefined;
    if (imageFile instanceof File && imageFile.size > 0) {
      imageUrl = await saveUploadedImage(imageFile);
    }

    await submitReport(talent.id, stepTemplateId, { comment, relatedUrl, imageUrl });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "送信に失敗しました。" };
  }

  revalidatePath(`/talent/${talent.slug}`);
  revalidatePath(`/talent/${talent.slug}/history`);

  return { success: true };
}

/**
 * タレントによる、自分が送信した完了報告の編集。
 * マネージャーがまだ確認していない（PENDING）報告のみ編集できる。
 * submitStepReportActionと同様、slugのみを信頼の根拠とする。
 */
export async function updateStepReportAction(formData: FormData): Promise<ActionResult> {
  const slug = formData.get("slug");
  const reportId = formData.get("reportId");
  if (typeof slug !== "string" || !slug || typeof reportId !== "string" || !reportId) {
    return { success: false, error: "不正なリクエストです。" };
  }

  const talent = await prisma.talent.findUnique({ where: { slug } });
  if (!talent) {
    return { success: false, error: "不正なリクエストです。" };
  }

  const report = await prisma.stepReport.findUnique({ where: { id: reportId } });
  if (!report || report.talentId !== talent.id) {
    return { success: false, error: "不正なリクエストです。" };
  }
  if (report.status !== "PENDING") {
    return { success: false, error: "確認待ちの報告のみ編集できます。" };
  }

  const commentRaw = formData.get("comment");
  const relatedUrlRaw = formData.get("relatedUrl");
  const comment = typeof commentRaw === "string" && commentRaw.trim() ? commentRaw.trim() : null;
  const relatedUrl =
    typeof relatedUrlRaw === "string" && relatedUrlRaw.trim() ? relatedUrlRaw.trim() : null;
  const imageFile = formData.get("image");

  try {
    let imageUrl = report.imageUrl;
    if (imageFile instanceof File && imageFile.size > 0) {
      imageUrl = await saveUploadedImage(imageFile);
    }

    await prisma.stepReport.update({
      where: { id: reportId },
      data: { comment, relatedUrl, imageUrl },
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "更新に失敗しました。" };
  }

  revalidatePath(`/talent/${talent.slug}/history`);
  revalidatePath(`/talent/${talent.slug}`);
  revalidatePath(`/admin/talents/${talent.id}`);
  revalidatePath("/admin/reports");

  return { success: true };
}
