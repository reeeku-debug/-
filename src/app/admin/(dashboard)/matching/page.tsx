import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PROJECT_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default async function MatchingPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { candidates: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">案件マッチング</h1>
          <p className="text-sm text-gray-500">
            案件を選んで「候補者を探す」を押すと、登録者全員の情報からAIが適した人を自動でランキング表示します。
          </p>
        </div>
        <Link href="/admin/projects/new" className="btn-primary whitespace-nowrap">
          + 新しい案件を登録
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="card py-12 text-center text-sm text-gray-400">
          まだ案件が登録されていません。まずは案件を登録してください。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/admin/projects/${p.id}`}
              className="card block transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-semibold">{p.name}</h2>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    statusColor(PROJECT_STATUS_OPTIONS, p.status)
                  )}
                >
                  {statusLabel(PROJECT_STATUS_OPTIONS, p.status)}
                </span>
              </div>
              <p className="mb-3 line-clamp-2 text-sm text-gray-500">{p.description}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">候補者 {p._count.candidates}人</span>
                <span className="font-medium text-brand-600">
                  {p._count.candidates > 0 ? "結果を見る →" : "マッチングを開始 →"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
