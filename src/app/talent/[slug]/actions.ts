"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitReport } from "@/lib/progress";
import { saveUploadedImage } from "@/lib/upload";

type ActionResult = { success: true } | { success: false; error: string };

/**
 * タレントによる完了報告の送信。
 * セキュリティ上、talentIdは常にセッションから取得し、クライアントからは
 * 一切受け取らない（他人の進捗を書き換えられないようにするため）。
 */
export async function submitStepReportAction(formData: FormData): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "TALENT") {
    return { success: false, error: "ログインが必要です。" };
  }

  const stepTemplateId = formData.get("stepTemplateId");
  if (typeof stepTemplateId !== "string" || !stepTemplateId) {
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

    await submitReport(session.user.id, stepTemplateId, { comment, relatedUrl, imageUrl });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "送信に失敗しました。" };
  }

  const talent = await prisma.talent.findUnique({ where: { id: session.user.id } });
  if (talent) revalidatePath(`/talent/${talent.slug}`);

  return { success: true };
}
