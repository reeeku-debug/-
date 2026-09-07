import { prisma } from "@/lib/prisma";
import { ReportReviewCard } from "@/components/admin/report-review-card";

export default async function AdminReportsPage() {
  const reports = await prisma.stepReport.findMany({
    where: { status: "PENDING" },
    orderBy: { submittedAt: "asc" },
    include: { talent: true, stepTemplate: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">完了報告の確認</h1>
      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          確認待ちの完了報告はありません。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reports.map((r) => (
            <ReportReviewCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
