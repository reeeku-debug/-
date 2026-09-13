"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recomputeAllTalentsChain } from "@/lib/progress";
import { randomToken } from "@/lib/utils";

type Result = { success: true } | { success: false; error: string };

function revalidateStepPaths() {
  revalidatePath("/admin/steps");
  revalidatePath("/admin");
  revalidatePath("/admin/talents");
}

export async function createStepAction(formData: FormData): Promise<Result> {
  await requireAdminSession();

  const title = (formData.get("title") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim();
  if (!title || !description) {
    return { success: false, error: "STEP名と内容を入力してください。" };
  }
  const icon = (formData.get("icon") as string | null)?.trim() || "✅";
  const buttonLabel = (formData.get("buttonLabel") as string | null)?.trim() || "完了報告を送る";

  const goal = await prisma.stepTemplate.findFirst({ where: { type: "GOAL" } });
  const insertOrder = goal ? goal.order : (await prisma.stepTemplate.count()) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.stepTemplate.updateMany({
      where: { order: { gte: insertOrder } },
      data: { order: { increment: 1 } },
    });
    await tx.stepTemplate.create({
      data: {
        order: insertOrder,
        key: `step_${randomToken(8)}`,
        icon,
        title,
        description,
        buttonLabel,
      },
    });
  });

  await recomputeAllTalentsChain();
  revalidateStepPaths();
  return { success: true };
}

export async function updateStepAction(stepId: string, formData: FormData): Promise<Result> {
  await requireAdminSession();

  const title = (formData.get("title") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim();
  if (!title || !description) {
    return { success: false, error: "STEP名と内容を入力してください。" };
  }
  const icon = (formData.get("icon") as string | null)?.trim() || "✅";
  const buttonLabel = (formData.get("buttonLabel") as string | null)?.trim() || "完了報告を送る";

  await prisma.stepTemplate.update({
    where: { id: stepId },
    data: { title, description, icon, buttonLabel },
  });

  revalidateStepPaths();
  return { success: true };
}

export async function toggleStepActiveAction(stepId: string): Promise<Result> {
  await requireAdminSession();
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepId } });
  if (step.type === "GOAL") {
    return { success: false, error: "GOALは無効化できません。" };
  }
  await prisma.stepTemplate.update({ where: { id: stepId }, data: { active: !step.active } });
  await recomputeAllTalentsChain();
  revalidateStepPaths();
  return { success: true };
}

export async function deleteStepAction(stepId: string): Promise<Result> {
  await requireAdminSession();
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepId } });
  if (step.type === "GOAL") {
    return { success: false, error: "GOALは削除できません。" };
  }
  const count = await prisma.stepTemplate.count();
  if (count <= 1) {
    return { success: false, error: "最後のSTEPは削除できません。" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.stepTemplate.delete({ where: { id: stepId } });
    await tx.stepTemplate.updateMany({
      where: { order: { gt: step.order } },
      data: { order: { decrement: 1 } },
    });
  });

  await recomputeAllTalentsChain();
  revalidateStepPaths();
  return { success: true };
}

export async function reorderStepAction(stepId: string, direction: "up" | "down"): Promise<Result> {
  await requireAdminSession();

  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepId } });
  if (step.type === "GOAL") {
    return { success: false, error: "GOALの順番は変更できません。" };
  }

  const neighbor = await prisma.stepTemplate.findFirst({
    where:
      direction === "up"
        ? { order: { lt: step.order } }
        : { order: { gt: step.order }, type: { not: "GOAL" } },
    orderBy: direction === "up" ? { order: "desc" } : { order: "asc" },
  });

  if (!neighbor) {
    return { success: false, error: "これ以上移動できません。" };
  }

  await prisma.$transaction([
    prisma.stepTemplate.update({ where: { id: step.id }, data: { order: neighbor.order } }),
    prisma.stepTemplate.update({ where: { id: neighbor.id }, data: { order: step.order } }),
  ]);

  await recomputeAllTalentsChain();
  revalidateStepPaths();
  return { success: true };
}
