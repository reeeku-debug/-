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

  return { success: true };
}
