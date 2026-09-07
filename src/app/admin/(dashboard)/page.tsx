import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeTalentProgress } from "@/lib/progress";
import { StatCard } from "@/components/admin/stat-card";
import { TalentProgressTable, type TalentProgressRow } from "@/components/admin/talent-progress-table";

export default async function AdminDashboardPage() {
  const [talents, steps, pendingCount] = await Promise.all([
    prisma.talent.findMany({
      orderBy: { createdAt: "desc" },
      include: { stepStatuses: true },
    }),
    prisma.stepTemplate.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.stepReport.count({ where: { status: "PENDING" } }),
  ]);

  const rows: TalentProgressRow[] = talents.map((t) => {
    const statusMap = new Map(t.stepStatuses.map((s) => [s.stepTemplateId, s.status]));
    const summary = summarizeTalentProgress(steps, statusMap);
    return {
      id: t.id,
      name: t.name,
      activityName: t.activityName,
      total: summary.total,
      cleared: summary.cleared,
      currentStepTitle: summary.currentStepTitle,
      stateLabel: summary.stateLabel,
    };
  });

  const goalCount = rows.filter((r) => r.stateLabel === "完了").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <Link
          href="/admin/talents/new"
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          ＋ タレントを追加
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="タレント数" value={talents.length} icon="👤" />
        <StatCard label="確認待ちの報告" value={pendingCount} icon="📨" />
        <StatCard label="GOAL達成" value={goalCount} icon="🏆" />
        <StatCard label="登録STEP数" value={steps.length} icon="🛠️" />
      </div>

      {pendingCount > 0 && (
        <Link
          href="/admin/reports"
          className="block rounded-2xl border border-sky-300 bg-sky-50 px-5 py-4 text-sm font-semibold text-sky-700 hover:bg-sky-100"
        >
          📨 確認待ちの完了報告が {pendingCount} 件あります。確認する →
        </Link>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500">タレント別の進捗</h2>
        <TalentProgressTable rows={rows} />
      </div>
    </div>
  );
}
