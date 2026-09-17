import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StepManageCard } from "@/components/admin/step-manage-card";
import { CreateStepForm } from "@/components/admin/create-step-form";
import { PatternSwitcher } from "@/components/admin/pattern-switcher";

export default async function AdminStepsPage({
  searchParams,
}: {
  searchParams: { pattern?: string };
}) {
  const allPatterns = await prisma.stepPattern.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { steps: true, talents: true } } },
  });
  if (allPatterns.length === 0) notFound();

  const currentPattern =
    allPatterns.find((p) => p.id === searchParams.pattern) ??
    allPatterns.find((p) => p.isDefault) ??
    allPatterns[0];

  const steps = await prisma.stepTemplate.findMany({
    where: { patternId: currentPattern.id },
    orderBy: { order: "asc" },
  });
  const normalSteps = steps.filter((s) => s.type !== "GOAL");

  const patternOptions = allPatterns.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isDefault: p.isDefault,
    stepCount: p._count.steps,
    talentCount: p._count.talents,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">STEP管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          STEP名・内容・アイコン・順番などを自由に編集できます。パターンごとに構成を分けて保存でき、タレント登録時にどのパターンを使うか選べます。
        </p>
      </div>

      <PatternSwitcher patterns={patternOptions} currentPatternId={currentPattern.id} />

      <div className="space-y-3">
        {steps.map((step) => {
          const idx = normalSteps.findIndex((s) => s.id === step.id);
          return (
            <StepManageCard
              key={step.id}
              step={step}
              displayNumber={idx + 1}
              isFirst={idx === 0}
              isLast={idx === normalSteps.length - 1}
            />
          );
        })}
      </div>

      <CreateStepForm patternId={currentPattern.id} />
    </div>
  );
}
