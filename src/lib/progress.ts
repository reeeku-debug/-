import { prisma } from "@/lib/prisma";

export type StepStatus = "LOCKED" | "CHALLENGE" | "REVIEW" | "CLEAR";

// セキュリティ上の大前提：
// これらの関数だけが進捗（TalentStepStatus）を書き換える。
// タレント側から呼び出せるのは submitReport のみで、それも
// CHALLENGE状態のSTEPをREVIEWに進めるだけであり、CLEARへは進められない。
// CLEARへ進める（＝進捗を確定する）操作はマネージャー用関数のみが行う。

/**
 * 新規タレント作成時に、有効なSTEP全件分のステータス行を作成する。
 * 先頭STEPのみ CHALLENGE、それ以外は LOCKED。
 */
export async function initializeTalentSteps(talentId: string) {
  const steps = await prisma.stepTemplate.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });

  await prisma.$transaction(
    steps.map((step, index) =>
      prisma.talentStepStatus.upsert({
        where: { talentId_stepTemplateId: { talentId, stepTemplateId: step.id } },
        create: {
          talentId,
          stepTemplateId: step.id,
          status: index === 0 ? "CHALLENGE" : "LOCKED",
        },
        update: {},
      })
    )
  );
}

/**
 * 指定STEPをCLEARにし、次のSTEPを解放する（内部専用・マネージャー操作からのみ呼ばれる）。
 * 次のSTEPが「報告不要」(GOAL等)の場合は連鎖的にCLEARにする。
 */
async function clearStepAndUnlockNext(talentId: string, stepTemplateId: string) {
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepTemplateId } });

  await prisma.talentStepStatus.upsert({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
    create: { talentId, stepTemplateId, status: "CLEAR", clearedAt: new Date() },
    update: { status: "CLEAR", clearedAt: new Date() },
  });

  let cursorOrder = step.order;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = await prisma.stepTemplate.findFirst({
      where: { active: true, order: { gt: cursorOrder } },
      orderBy: { order: "asc" },
    });
    if (!next) break;

    if (!next.requiresReport) {
      // GOAL等、報告不要のSTEPは自動的にCLEARにして連鎖継続
      await prisma.talentStepStatus.upsert({
        where: { talentId_stepTemplateId: { talentId, stepTemplateId: next.id } },
        create: { talentId, stepTemplateId: next.id, status: "CLEAR", clearedAt: new Date() },
        update: { status: "CLEAR", clearedAt: new Date() },
      });
      cursorOrder = next.order;
      continue;
    }

    const existing = await prisma.talentStepStatus.findUnique({
      where: { talentId_stepTemplateId: { talentId, stepTemplateId: next.id } },
    });
    if (!existing || existing.status === "LOCKED") {
      await prisma.talentStepStatus.upsert({
        where: { talentId_stepTemplateId: { talentId, stepTemplateId: next.id } },
        create: { talentId, stepTemplateId: next.id, status: "CHALLENGE" },
        update: { status: "CHALLENGE" },
      });
    }
    break;
  }
}

/**
 * タレントが完了報告を送信する。CHALLENGE状態のSTEPのみ許可。
 * ステータスはREVIEWに進むのみで、CLEARにはならない。
 */
export async function submitReport(
  talentId: string,
  stepTemplateId: string,
  data: { comment?: string; imageUrl?: string; relatedUrl?: string }
) {
  const current = await prisma.talentStepStatus.findUnique({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
  });
  if (!current || current.status !== "CHALLENGE") {
    throw new Error("このSTEPは現在挑戦中ではないため、完了報告を送信できません。");
  }

  await prisma.$transaction([
    prisma.stepReport.create({
      data: {
        talentId,
        stepTemplateId,
        comment: data.comment || null,
        imageUrl: data.imageUrl || null,
        relatedUrl: data.relatedUrl || null,
        status: "PENDING",
      },
    }),
    prisma.talentStepStatus.update({
      where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
      data: { status: "REVIEW" },
    }),
  ]);
}

/** マネージャー：完了報告を承認する → STEPがCLEARになり、次のSTEPが解放される */
export async function approveReport(reportId: string, adminId: string, reviewComment?: string) {
  const report = await prisma.stepReport.findUniqueOrThrow({ where: { id: reportId } });
  if (report.status !== "PENDING") {
    throw new Error("この報告はすでに確認済みです。");
  }

  await prisma.stepReport.update({
    where: { id: reportId },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
      reviewComment: reviewComment || null,
    },
  });

  await clearStepAndUnlockNext(report.talentId, report.stepTemplateId);
}

/** マネージャー：完了報告を差し戻す → STEPはCHALLENGEに戻り再提出できる */
export async function rejectReport(reportId: string, adminId: string, reviewComment?: string) {
  const report = await prisma.stepReport.findUniqueOrThrow({ where: { id: reportId } });
  if (report.status !== "PENDING") {
    throw new Error("この報告はすでに確認済みです。");
  }

  await prisma.$transaction([
    prisma.stepReport.update({
      where: { id: reportId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        reviewComment: reviewComment || null,
      },
    }),
    prisma.talentStepStatus.update({
      where: {
        talentId_stepTemplateId: { talentId: report.talentId, stepTemplateId: report.stepTemplateId },
      },
      data: { status: "CHALLENGE" },
    }),
  ]);
}

/** マネージャー：STEPを直接CLEARにする（スキップも同じ処理） */
export async function adminForceClear(talentId: string, stepTemplateId: string) {
  await clearStepAndUnlockNext(talentId, stepTemplateId);
}

/** マネージャー：STEPを未達成（挑戦中）に戻す。以降のSTEPは連鎖的にロックされる。 */
export async function adminRevertToChallenge(talentId: string, stepTemplateId: string) {
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepTemplateId } });

  await prisma.talentStepStatus.upsert({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
    create: { talentId, stepTemplateId, status: "CHALLENGE" },
    update: { status: "CHALLENGE", clearedAt: null },
  });

  await lockAllAfter(talentId, step.order);
}

/** マネージャー：STEPを強制的にロックする。以降のSTEPも連鎖的にロックされる。 */
export async function adminForceLock(talentId: string, stepTemplateId: string) {
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepTemplateId } });

  await prisma.talentStepStatus.upsert({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
    create: { talentId, stepTemplateId, status: "LOCKED" },
    update: { status: "LOCKED", clearedAt: null },
  });

  await lockAllAfter(talentId, step.order);
}

async function lockAllAfter(talentId: string, order: number) {
  const laterSteps = await prisma.stepTemplate.findMany({
    where: { active: true, order: { gt: order } },
  });
  if (laterSteps.length === 0) return;

  await prisma.$transaction(
    laterSteps.map((s) =>
      prisma.talentStepStatus.upsert({
        where: { talentId_stepTemplateId: { talentId, stepTemplateId: s.id } },
        create: { talentId, stepTemplateId: s.id, status: "LOCKED" },
        update: { status: "LOCKED", clearedAt: null },
      })
    )
  );
}

/**
 * STEPマスタの構成変更（追加・削除・並び替え・有効/無効切替）後に、
 * 全タレントの進捗ステータスを整合性のある状態へ再計算する。
 */
export async function recomputeAllTalentsChain() {
  const talents = await prisma.talent.findMany({ select: { id: true } });
  for (const t of talents) {
    await recomputeTalentChain(t.id);
  }
}

export async function recomputeTalentChain(talentId: string) {
  const steps = await prisma.stepTemplate.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
  const statuses = await prisma.talentStepStatus.findMany({ where: { talentId } });
  const statusMap = new Map(statuses.map((s) => [s.stepTemplateId, s.status]));

  let previousCleared = true;
  const ops = [];

  for (const step of steps) {
    const existing = statusMap.get(step.id);

    if (existing === "CLEAR") {
      previousCleared = true;
      continue;
    }
    if (existing === "REVIEW") {
      previousCleared = false;
      continue;
    }

    let nextStatus: StepStatus;
    if (previousCleared) {
      nextStatus = step.requiresReport ? "CHALLENGE" : "CLEAR";
    } else {
      nextStatus = "LOCKED";
    }

    if (existing !== nextStatus) {
      ops.push(
        prisma.talentStepStatus.upsert({
          where: { talentId_stepTemplateId: { talentId, stepTemplateId: step.id } },
          create: {
            talentId,
            stepTemplateId: step.id,
            status: nextStatus,
            clearedAt: nextStatus === "CLEAR" ? new Date() : null,
          },
          update: {
            status: nextStatus,
            clearedAt: nextStatus === "CLEAR" ? new Date() : null,
          },
        })
      );
    }

    previousCleared = nextStatus === "CLEAR";
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
}

/** 進捗率計算用：報告が必要なSTEP（＝GOAL等を除く実質STEP）の総数とCLEAR数 */
export function calcProgress(
  steps: { id: string; requiresReport: boolean }[],
  statusByStepId: Map<string, string>
) {
  const countable = steps.filter((s) => s.requiresReport);
  const cleared = countable.filter((s) => statusByStepId.get(s.id) === "CLEAR");
  return { total: countable.length, cleared: cleared.length };
}

/** マネージャーダッシュボード用：タレント1人分の進捗サマリーを計算する */
export function summarizeTalentProgress(
  steps: { id: string; title: string; type: string; requiresReport: boolean; order: number }[],
  statusByStepId: Map<string, string>
) {
  const normalSteps = steps.filter((s) => s.requiresReport);
  const clearedCount = normalSteps.filter((s) => statusByStepId.get(s.id) === "CLEAR").length;
  const goalStep = steps.find((s) => s.type === "GOAL");
  const goalCleared = goalStep ? statusByStepId.get(goalStep.id) === "CLEAR" : false;

  if (goalCleared) {
    return {
      total: normalSteps.length,
      cleared: clearedCount,
      currentStepTitle: "GOAL",
      stateLabel: "完了" as const,
    };
  }

  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const current = sorted.find((s) => {
    const st = statusByStepId.get(s.id);
    return st === "CHALLENGE" || st === "REVIEW";
  });

  return {
    total: normalSteps.length,
    cleared: clearedCount,
    currentStepTitle: current?.title ?? "-",
    stateLabel: current
      ? statusByStepId.get(current.id) === "REVIEW"
        ? ("確認待ち" as const)
        : ("挑戦中" as const)
      : ("-" as const),
  };
}
