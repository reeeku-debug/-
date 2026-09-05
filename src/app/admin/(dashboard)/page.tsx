import Link from "next/link";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/admin/stat-card";
import { formatDateTime, isStale } from "@/lib/utils";
import { PROJECT_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default async function AdminDashboard() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalRespondents, newThisMonth, projectCount, candidateCount, allRespondents, recentRegistered, recentUpdated, recentProjects] =
    await Promise.all([
      prisma.user.count({ where: { role: "RESPONDENT" } }),
      prisma.user.count({ where: { role: "RESPONDENT", createdAt: { gte: startOfMonth } } }),
      prisma.project.count(),
      prisma.projectCandidate.count(),
      prisma.user.findMany({ where: { role: "RESPONDENT" }, select: { id: true, updatedAt: true } }),
      prisma.user.findMany({
        where: { role: "RESPONDENT" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, stageName: true, createdAt: true },
      }),
      prisma.user.findMany({
        where: { role: "RESPONDENT" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, stageName: true, updatedAt: true },
      }),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { _count: { select: { candidates: true } } },
      }),
    ]);

  const needsUpdateCount = allRespondents.filter((u) => isStale(u.updatedAt)).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-gray-500">登録状況と案件マッチングの概況</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="登録者数" value={totalRespondents} />
        <StatCard label="今月の新規登録者数" value={newThisMonth} />
        <StatCard label="情報更新が必要な人数" value={needsUpdateCount} hint="90日以上未更新" />
        <StatCard label="現在の案件数" value={projectCount} />
        <StatCard label="案件候補者数" value={candidateCount} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">最近登録された人</h2>
          <ul className="divide-y">
            {recentRegistered.length === 0 && <p className="py-4 text-sm text-gray-400">登録者がいません</p>}
            {recentRegistered.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/admin/talents/${u.id}`} className="font-medium text-brand-600 hover:underline">
                  {u.stageName || "（芸名未設定）"}
                </Link>
                <span className="text-gray-400">{formatDateTime(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">最近更新された人</h2>
          <ul className="divide-y">
            {recentUpdated.length === 0 && <p className="py-4 text-sm text-gray-400">登録者がいません</p>}
            {recentUpdated.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/admin/talents/${u.id}`} className="font-medium text-brand-600 hover:underline">
                  {u.stageName || "（芸名未設定）"}
                </Link>
                <span className="text-gray-400">{formatDateTime(u.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">最近の案件</h2>
          <Link href="/admin/projects" className="text-sm text-brand-600 underline">
            すべて見る
          </Link>
        </div>
        <ul className="divide-y">
          {recentProjects.length === 0 && <p className="py-4 text-sm text-gray-400">案件がまだ登録されていません</p>}
          {recentProjects.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/admin/projects/${p.id}`} className="font-medium text-brand-600 hover:underline">
                {p.name}
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-gray-400">候補者 {p._count.candidates}人</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    statusColor(PROJECT_STATUS_OPTIONS, p.status)
                  )}
                >
                  {statusLabel(PROJECT_STATUS_OPTIONS, p.status)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
