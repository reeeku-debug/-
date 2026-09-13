import { prisma } from "@/lib/prisma";
import { StepManageCard } from "@/components/admin/step-manage-card";
import { CreateStepForm } from "@/components/admin/create-step-form";

export default async function AdminStepsPage() {
  const steps = await prisma.stepTemplate.findMany({ orderBy: { order: "asc" } });
  const normalSteps = steps.filter((s) => s.type !== "GOAL");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">STEP管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          STEP名・内容・アイコン・順番などを自由に編集できます。変更は全タレントの進捗表示に反映されます。
        </p>
      </div>

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

      <CreateStepForm />
    </div>
  );
}
