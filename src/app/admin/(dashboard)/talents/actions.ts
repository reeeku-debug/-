"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { initializeTalentSteps } from "@/lib/progress";
import { randomPassword, randomToken } from "@/lib/utils";

type CreateResult =
  | { success: true; talentId: string; loginId: string; password: string; slug: string }
  | { success: false; error: string };

export async function createTalentAction(formData: FormData): Promise<CreateResult> {
  await requireAdminSession();

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return { success: false, error: "タレント名を入力してください。" };
  }

  const activityName = (formData.get("activityName") as string | null)?.trim() || null;
  const firstStreamDateRaw = (formData.get("firstStreamDate") as string | null) || "";
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  let loginId = (formData.get("loginId") as string | null)?.trim();

  if (loginId) {
    const existing = await prisma.talent.findUnique({ where: { loginId } });
    if (existing) {
      return { success: false, error: "このログインIDは既に使用されています。" };
    }
  } else {
    let candidate = randomToken(8);
    while (await prisma.talent.findUnique({ where: { loginId: candidate } })) {
      candidate = randomToken(8);
    }
    loginId = candidate;
  }

  let slug = randomToken(14);
  while (await prisma.talent.findUnique({ where: { slug } })) {
    slug = randomToken(14);
  }

  const rawPassword = randomPassword(10);
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const talent = await prisma.talent.create({
    data: {
      name,
      activityName,
      firstStreamDate: firstStreamDateRaw ? new Date(firstStreamDateRaw) : null,
      notes,
      loginId,
      passwordHash,
      slug,
    },
  });

  await initializeTalentSteps(talent.id);

  revalidatePath("/admin/talents");
  revalidatePath("/admin");

  return { success: true, talentId: talent.id, loginId, password: rawPassword, slug };
}

export async function deleteTalentAction(
  talentId: string
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAdminSession();
  try {
    await prisma.talent.delete({ where: { id: talentId } });
  } catch {
    return { success: false, error: "削除に失敗しました。" };
  }
  revalidatePath("/admin/talents");
  revalidatePath("/admin");
  return { success: true };
}
