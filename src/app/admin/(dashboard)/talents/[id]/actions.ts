"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { adminForceClear, adminForceLock, adminRevertToChallenge } from "@/lib/progress";
import { randomPassword } from "@/lib/utils";

type Result = { success: true } | { success: false; error: string };

export async function updateTalentInfoAction(talentId: string, formData: FormData): Promise<Result> {
  await requireAdminSession();

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return { success: false, error: "タレント名を入力してください。" };
  }

  const managementNo = (formData.get("managementNo") as string | null)?.trim() || null;
  const activityName = (formData.get("activityName") as string | null)?.trim() || null;
  const firstStreamDateRaw = (formData.get("firstStreamDate") as string | null) || "";
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  await prisma.talent.update({
    where: { id: talentId },
    data: {
      name,
      managementNo,
      activityName,
      firstStreamDate: firstStreamDateRaw ? new Date(firstStreamDateRaw) : null,
      notes,
    },
  });

  revalidatePath(`/admin/talents/${talentId}`);
  revalidatePath("/admin/talents");
  revalidatePath("/admin");
  return { success: true };
}

export async function resetTalentPasswordAction(talentId: string): Promise<{ password: string }> {
  await requireAdminSession();
  const rawPassword = randomPassword(10);
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  await prisma.talent.update({ where: { id: talentId }, data: { passwordHash } });
  revalidatePath(`/admin/talents/${talentId}`);
  return { password: rawPassword };
}

export async function setStepStatusAction(
  talentId: string,
  stepTemplateId: string,
  action: "clear" | "revert" | "lock" | "skip"
): Promise<Result> {
  await requireAdminSession();

  try {
    if (action === "clear" || action === "skip") {
      await adminForceClear(talentId, stepTemplateId);
    } else if (action === "revert") {
      await adminRevertToChallenge(talentId, stepTemplateId);
    } else if (action === "lock") {
      await adminForceLock(talentId, stepTemplateId);
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作に失敗しました。" };
  }

  revalidatePath(`/admin/talents/${talentId}`);
  revalidatePath("/admin/talents");
  revalidatePath("/admin");
  return { success: true };
}
