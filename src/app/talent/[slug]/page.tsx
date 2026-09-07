import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProgressHeader } from "@/components/talent/progress-header";
import { GoalBanner } from "@/components/talent/goal-banner";
import { RoadmapStepCard, type StepStatus } from "@/components/talent/step-card";
import { SignOutButton } from "@/components/sign-out-button";

export default async function TalentRoadmapPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "TALENT") {
    redirect("/login");
  }

  const talent = await prisma.talent.findUnique({ where: { id: session.user.id } });
  if (!talent) {
    redirect("/login");
  }
  // 念のための二重チェック（本来はmiddlewareで自分のslug以外へは来ない）
  if (talent.slug !== params.slug) {
    redirect(`/talent/${talent.slug}`);
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
        <SignOutButton />
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
