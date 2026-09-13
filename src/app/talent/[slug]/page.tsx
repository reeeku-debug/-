import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProgressHeader } from "@/components/talent/progress-header";
import { GoalBanner } from "@/components/talent/goal-banner";
import { RoadmapStepCard, type StepStatus } from "@/components/talent/step-card";

export default async function TalentRoadmapPage({ params }: { params: { slug: string } }) {
  // この専用URL（slug）自体がアクセストークンとして機能するため、
  // ログインは不要。slugが一致するタレントのデータのみを表示する。
  const talent = await prisma.talent.findUnique({ where: { slug: params.slug } });
  if (!talent) {
    notFound();
  }

  const steps = await prisma.stepTemplate.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
  const statuses = await prisma.talentStepStatus.findMany({ where: { talentId: talent.id } });
  const reports = await prisma.stepReport.findMany({
    where: { talentId: talent.id },
    orderBy: { submittedAt: "desc" },
  });

  const statusMap = new Map(statuses.map((s) => [s.stepTemplateId, s.status as StepStatus]));
  const latestReportMap = new Map<string, (typeof reports)[number]>();
  for (const r of reports) {
    if (!latestReportMap.has(r.stepTemplateId)) latestReportMap.set(r.stepTemplateId, r);
  }

  const normalSteps = steps.filter((s) => s.requiresReport);
  const clearedCount = normalSteps.filter((s) => statusMap.get(s.id) === "CLEAR").length;
  const goalStep = steps.find((s) => s.type === "GOAL");
  const goalCleared = goalStep ? statusMap.get(goalStep.id) === "CLEAR" : false;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-16 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-400">VTuber活動ロードマップ</p>
        <Link href={`/talent/${talent.slug}/history`} className="text-xs font-semibold text-brand-600 hover:underline">
          提出履歴を見る →
        </Link>
      </div>

      <ProgressHeader name={talent.name} total={normalSteps.length} cleared={clearedCount} />

      {goalCleared && <GoalBanner />}

      <ol className="mt-8">
        <li className="relative pb-8 pl-10">
          <span className="absolute left-[15px] top-8 h-full w-0.5 bg-brand-400" />
          <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-brand-500 bg-brand-500 text-sm text-white">
            🚩
          </span>
          <p className="pt-1 font-bold">活動開始！</p>
        </li>
        {steps.map((step, i) => (
          <RoadmapStepCard
            key={step.id}
            slug={talent.slug}
            step={step}
            status={statusMap.get(step.id) ?? "LOCKED"}
            latestReport={latestReportMap.get(step.id) ?? null}
            isLast={i === steps.length - 1}
          />
        ))}
      </ol>
    </main>
  );
}
