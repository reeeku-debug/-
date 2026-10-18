"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { approveStampClaim, rejectStampClaim } from "@/lib/stamps";

type Result = { success: true } | { success: false; error: string };

function revalidateStampPaths() {
  revalidatePath("/admin/stamps");
}

export async function createStampItemAction(formData: FormData): Promise<Result> {
  await requireAdminSession();

  const title = (formData.get("title") as string | null)?.trim();
  if (!title) {
    return { success: false, error: "スタンプ名を入力してください。" };
  }
  const description = (formData.get("description") as string | null)?.trim() || null;
  const icon = (formData.get("icon") as string | null)?.trim() || "⭐";

  const maxOrder = await prisma.stampItem.aggregate({ _max: { order: true } });
  await prisma.stampItem.create({
    data: { title, description, icon, order: (maxOrder._max.order ?? 0) + 1 },
  });

  revalidateStampPaths();
  return { success: true };
}

export async function updateStampItemAction(itemId: string, formData: FormData): Promise<Result> {
  await requireAdminSession();

  const title = (formData.get("title") as string | null)?.trim();
  if (!title) {
    return { success: false, error: "スタンプ名を入力してください。" };
  }
  const description = (formData.get("description") as string | null)?.trim() || null;
  const icon = (formData.get("icon") as string | null)?.trim() || "⭐";

  await prisma.stampItem.update({ where: { id: itemId }, data: { title, description, icon } });
  revalidateStampPaths();
  return { success: true };
}

export async function toggleStampItemActiveAction(itemId: string): Promise<Result> {
  await requireAdminSession();
  const item = await prisma.stampItem.findUniqueOrThrow({ where: { id: itemId } });
  await prisma.stampItem.update({ where: { id: itemId }, data: { active: !item.active } });
  revalidateStampPaths();
  return { success: true };
}

export async function deleteStampItemAction(itemId: string): Promise<Result> {
  await requireAdminSession();
  await prisma.stampItem.delete({ where: { id: itemId } });
  revalidateStampPaths();
  return { success: true };
}

export async function reorderStampItemAction(itemId: string, direction: "up" | "down"): Promise<Result> {
  await requireAdminSession();

  const item = await prisma.stampItem.findUniqueOrThrow({ where: { id: itemId } });
  const neighbor = await prisma.stampItem.findFirst({
    where: direction === "up" ? { order: { lt: item.order } } : { order: { gt: item.order } },
    orderBy: direction === "up" ? { order: "desc" } : { order: "asc" },
  });
  if (!neighbor) {
    return { success: false, error: "これ以上移動できません。" };
  }

  await prisma.$transaction([
    prisma.stampItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
    prisma.stampItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
  ]);
  revalidateStampPaths();
  return { success: true };
}

export async function approveStampClaimAction(claimId: string): Promise<Result> {
  const session = await requireAdminSession();
  try {
    await approveStampClaim(claimId, session.user.id);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "承認に失敗しました。" };
  }
  revalidateStampPaths();
  revalidatePath("/admin/talents");
  return { success: true };
}

export async function rejectStampClaimAction(claimId: string, reviewComment: string): Promise<Result> {
  const session = await requireAdminSession();
  try {
    await rejectStampClaim(claimId, session.user.id, reviewComment || undefined);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "差し戻しに失敗しました。" };
  }
  revalidateStampPaths();
  return { success: true };
}
