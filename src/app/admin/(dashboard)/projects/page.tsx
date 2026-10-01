import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PROJECT_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { candidates: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">案件管理</h1>
          <p className="text-sm text-gray-500">全 {projects.length} 件</p>
        </div>
        <Link href="/admin/projects/new" className="btn-primary">
          + 新しい案件を登録
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">案件名</th>
              <th className="px-4 py-3">ジャンル</th>
              <th className="px-4 py-3">登録日</th>
              <th className="px-4 py-3">候補者数</th>
              <th className="px-4 py-3">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  案件がまだ登録されていません
                </td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-brand-50/40">
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/projects/${p.id}`} className="text-brand-600 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{p.genre}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(p.createdAt)}</td>
                <td className="px-4 py-3 text-gray-600">{p._count.candidates}人</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      statusColor(PROJECT_STATUS_OPTIONS, p.status)
                    )}
                  >
                    {statusLabel(PROJECT_STATUS_OPTIONS, p.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
