"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

type Result = { success: true } | { success: false; error: string };
type CreateResult = { success: true; patternId: string } | { success: false; error: string };

function revalidatePatternPaths() {
  revalidatePath("/admin/steps");
  revalidatePath("/admin/talents/new");
}

/** 新しいSTEPパターンを作成する。sourcePatternIdを指定すると、そのパターンのSTEP構成を複製する。 */
export async function createPatternAction(formData: FormData): Promise<CreateResult> {
  await requireAdminSession();

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return { success: false, error: "パターン名を入力してください。" };
  }
  const description = (formData.get("description") as string | null)?.trim() || null;
  const sourcePatternId = (formData.get("sourcePatternId") as string | null) || null;

  const pattern = await prisma.$transaction(async (tx) => {
    const created = await tx.stepPattern.create({
      data: { name, description },
    });

    if (sourcePatternId) {
      const sourceSteps = await tx.stepTemplate.findMany({
        where: { patternId: sourcePatternId },
        orderBy: { order: "asc" },
      });
      for (const s of sourceSteps) {
        await tx.stepTemplate.create({
          data: {
            patternId: created.id,
            order: s.order,
            key: s.key,
            icon: s.icon,
            title: s.title,
            description: s.description,
            buttonLabel: s.buttonLabel,
            type: s.type,
            requiresReport: s.requiresReport,
            active: s.active,
          },
        });
      }
    } else {
      // 空から作成する場合も、GOALだけは構造上必要なため用意する
      await tx.stepTemplate.create({
        data: {
          patternId: created.id,
          order: 1,
          key: "goal",
          icon: "🏆",
          title: "GOAL",
          description: "🎉 ここまでのSTEPが完了しました！",
          type: "GOAL",
          requiresReport: false,
        },
      });
    }

    return created;
  });

  revalidatePatternPaths();
  return { success: true, patternId: pattern.id };
}

export async function renamePatternAction(patternId: string, formData: FormData): Promise<Result> {
  await requireAdminSession();

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return { success: false, error: "パターン名を入力してください。" };
  }
  const description = (formData.get("description") as string | null)?.trim() || null;

  await prisma.stepPattern.update({ where: { id: patternId }, data: { name, description } });
  revalidatePatternPaths();
  return { success: true };
}

export async function setDefaultPatternAction(patternId: string): Promise<Result> {
  await requireAdminSession();

  await prisma.$transaction([
    prisma.stepPattern.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.stepPattern.update({ where: { id: patternId }, data: { isDefault: true } }),
  ]);

  revalidatePatternPaths();
  return { success: true };
}

export async function deletePatternAction(patternId: string): Promise<Result> {
  await requireAdminSession();

  const pattern = await prisma.stepPattern.findUniqueOrThrow({
    where: { id: patternId },
    include: { _count: { select: { talents: true } } },
  });

  if (pattern.isDefault) {
    return { success: false, error: "既定のパターンは削除できません。先に別のパターンを既定に設定してください。" };
  }
  if (pattern._count.talents > 0) {
    return { success: false, error: "このパターンを使用しているタレントがいるため削除できません。" };
  }

  const patternCount = await prisma.stepPattern.count();
  if (patternCount <= 1) {
    return { success: false, error: "最後の1件は削除できません。" };
  }

  await prisma.stepPattern.delete({ where: { id: patternId } });
  revalidatePatternPaths();
  return { success: true };
}
