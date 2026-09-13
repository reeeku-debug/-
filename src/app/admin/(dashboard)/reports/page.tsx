import { prisma } from "@/lib/prisma";
import { ReportSearchList } from "@/components/admin/report-search-list";

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
        <ReportSearchList reports={reports} />
      )}
    </div>
  );
}
