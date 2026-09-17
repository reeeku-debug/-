import { prisma } from "@/lib/prisma";

export type StepStatus = "LOCKED" | "CHALLENGE" | "REVIEW" | "CLEAR";

type StepForBlocks = { id: string; order: number; requiresReport: boolean; parallelWithPrevious: boolean };

// セキュリティ上の大前提：
// これらの関数だけが進捗（TalentStepStatus）を書き換える。
// タレント側から呼び出せるのは submitReport のみで、それも
// CHALLENGE状態のSTEPをREVIEWに進めるだけであり、CLEARへは進められない。
// CLEARへ進める（＝進捗を確定する）操作はマネージャー用関数のみが行う。

/**
 * 順番に並んだSTEPを「ブロック」単位にまとめる。
 * parallelWithPrevious=false のSTEPは新しいブロックの先頭（＝ターニングポイント）、
 * true のSTEPは直前のブロックに合流する（＝同じタイミングで開放され、並行して報告できる）。
 */
function computeBlocks<T extends StepForBlocks>(steps: T[]): T[][] {
  const blocks: T[][] = [];
  for (const step of steps) {
    if (blocks.length === 0 || !step.parallelWithPrevious) {
      blocks.push([step]);
    } else {
      blocks[blocks.length - 1].push(step);
    }
  }
  return blocks;
}

/**
 * 新規タレント作成時に、そのタレントが使うSTEPパターンの有効STEP全件分の
 * ステータス行を作成する。先頭ブロックのSTEPのみ CHALLENGE（報告不要なら即CLEAR）、
 * それ以外は LOCKED。
 */
export async function initializeTalentSteps(talentId: string, patternId: string) {
  const steps = await prisma.stepTemplate.findMany({
    where: { patternId, active: true },
    orderBy: { order: "asc" },
  });
  const blocks = computeBlocks(steps);

  const ops = blocks.flatMap((block, blockIndex) =>
    block.map((step) => {
      const isFirstBlock = blockIndex === 0;
      const status: StepStatus = isFirstBlock ? (step.requiresReport ? "CHALLENGE" : "CLEAR") : "LOCKED";
      return prisma.talentStepStatus.upsert({
        where: { talentId_stepTemplateId: { talentId, stepTemplateId: step.id } },
        create: {
          talentId,
          stepTemplateId: step.id,
          status,
          clearedAt: status === "CLEAR" ? new Date() : null,
        },
        update: {},
      });
    })
  );

  await prisma.$transaction(ops);
}

/**
 * 指定STEPをCLEARにし、そのSTEPが属するブロックが全てCLEARになっていれば
 * 次のブロックを解放する（内部専用・マネージャー操作からのみ呼ばれる）。
 * 同じブロック内の他のSTEPが未完了の場合は、そのまま並行して開放され続ける。
 * 次のブロックが「報告不要」(GOAL等)のSTEPのみの場合は連鎖的にCLEARにする。
 */
async function clearStepAndUnlockNext(talentId: string, stepTemplateId: string) {
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepTemplateId } });

  await prisma.talentStepStatus.upsert({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
    create: { talentId, stepTemplateId, status: "CLEAR", clearedAt: new Date() },
    update: { status: "CLEAR", clearedAt: new Date() },
  });

  const steps = await prisma.stepTemplate.findMany({
    where: { patternId: step.patternId, active: true },
    orderBy: { order: "asc" },
  });
  const blocks = computeBlocks(steps);
  const blockIndex = blocks.findIndex((b) => b.some((s) => s.id === stepTemplateId));
  if (blockIndex === -1) return;

  const blockStepIds = blocks[blockIndex].map((s) => s.id);
  const blockStatuses = await prisma.talentStepStatus.findMany({
    where: { talentId, stepTemplateId: { in: blockStepIds } },
  });
  const blockStatusMap = new Map(blockStatuses.map((s) => [s.stepTemplateId, s.status]));
  const blockFullyCleared = blocks[blockIndex].every((s) => blockStatusMap.get(s.id) === "CLEAR");
  if (!blockFullyCleared) return; // 同じブロックの他のSTEPがまだ完了していないので、次のブロックはまだ開放しない

  // 次のブロックを順に開放する。報告不要のSTEPのみのブロックは自動的にCLEARにして連鎖継続。
  let cursor = blockIndex + 1;
  while (cursor < blocks.length) {
    const block = blocks[cursor];
    let allAutoCleared = true;

    for (const s of block) {
      if (!s.requiresReport) {
        await prisma.talentStepStatus.upsert({
          where: { talentId_stepTemplateId: { talentId, stepTemplateId: s.id } },
          create: { talentId, stepTemplateId: s.id, status: "CLEAR", clearedAt: new Date() },
          update: { status: "CLEAR", clearedAt: new Date() },
        });
        continue;
      }

      allAutoCleared = false;
      const existing = await prisma.talentStepStatus.findUnique({
        where: { talentId_stepTemplateId: { talentId, stepTemplateId: s.id } },
      });
      if (!existing || existing.status === "LOCKED") {
        await prisma.talentStepStatus.upsert({
          where: { talentId_stepTemplateId: { talentId, stepTemplateId: s.id } },
          create: { talentId, stepTemplateId: s.id, status: "CHALLENGE" },
          update: { status: "CHALLENGE" },
        });
      }
    }

    if (!allAutoCleared) break; // 報告が必要なSTEPを開放したので連鎖はここで止まる
    cursor++; // このブロックは全て自動CLEARだったので、さらに次のブロックも確認する
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

/** マネージャー：完了報告を承認する → STEPがCLEARになり、ブロックが揃えば次のブロックが解放される */
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

/** マネージャー：STEPを未達成（挑戦中）に戻す。以降のブロックは連鎖的にロックされる。 */
export async function adminRevertToChallenge(talentId: string, stepTemplateId: string) {
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepTemplateId } });

  await prisma.talentStepStatus.upsert({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
    create: { talentId, stepTemplateId, status: "CHALLENGE" },
    update: { status: "CHALLENGE", clearedAt: null },
  });

  await lockBlocksAfter(talentId, step.patternId, stepTemplateId);
}

/** マネージャー：STEPを強制的にロックする。以降のブロックも連鎖的にロックされる。 */
export async function adminForceLock(talentId: string, stepTemplateId: string) {
  const step = await prisma.stepTemplate.findUniqueOrThrow({ where: { id: stepTemplateId } });

  await prisma.talentStepStatus.upsert({
    where: { talentId_stepTemplateId: { talentId, stepTemplateId } },
    create: { talentId, stepTemplateId, status: "LOCKED" },
    update: { status: "LOCKED", clearedAt: null },
  });

  await lockBlocksAfter(talentId, step.patternId, stepTemplateId);
}

/** 指定STEPが属するブロックより後ろの全ブロックを強制的にLOCKEDに戻す */
async function lockBlocksAfter(talentId: string, patternId: string, stepTemplateId: string) {
  const steps = await prisma.stepTemplate.findMany({
    where: { patternId, active: true },
    orderBy: { order: "asc" },
  });
  const blocks = computeBlocks(steps);
  const blockIndex = blocks.findIndex((b) => b.some((s) => s.id === stepTemplateId));
  if (blockIndex === -1) return;

  const laterSteps = blocks.slice(blockIndex + 1).flat();
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
 * STEPマスタの構成変更（追加・削除・並び替え・有効/無効切替・同時申請設定の変更）後に、
 * 該当パターンを使う全タレントの進捗ステータスを整合性のある状態へ再計算する。
 * patternIdを省略すると全タレントが対象になる。
 */
export async function recomputeAllTalentsChain(patternId?: string) {
  const talents = await prisma.talent.findMany({
    where: patternId ? { patternId } : undefined,
    select: { id: true, patternId: true },
  });
  for (const t of talents) {
    await recomputeTalentChain(t.id, t.patternId);
  }
}

export async function recomputeTalentChain(talentId: string, patternId: string) {
  const steps = await prisma.stepTemplate.findMany({
    where: { patternId, active: true },
    orderBy: { order: "asc" },
  });
  const blocks = computeBlocks(steps);
  const statuses = await prisma.talentStepStatus.findMany({ where: { talentId } });
  const statusMap = new Map(statuses.map((s) => [s.stepTemplateId, s.status]));

  let previousBlockOpen = true;
  const ops = [];

  for (const block of blocks) {
    let blockFullyCleared = true;

    for (const step of block) {
      const existing = statusMap.get(step.id);
      let stepCleared: boolean;

      if (existing === "CLEAR") {
        stepCleared = true;
      } else if (existing === "REVIEW") {
        stepCleared = false;
      } else {
        const nextStatus: StepStatus = previousBlockOpen
          ? step.requiresReport
            ? "CHALLENGE"
            : "CLEAR"
          : "LOCKED";
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
        stepCleared = nextStatus === "CLEAR";
      }

      if (!stepCleared) blockFullyCleared = false;
    }

    previousBlockOpen = blockFullyCleared;
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
