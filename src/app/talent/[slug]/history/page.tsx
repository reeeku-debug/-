import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReportHistoryItem } from "@/components/talent/report-history-item";

export default async function TalentHistoryPage({ params }: { params: { slug: string } }) {
  const talent = await prisma.talent.findUnique({ where: { slug: params.slug } });
  if (!talent) {
    notFound();
  }

  const reports = await prisma.stepReport.findMany({
    where: { talentId: talent.id },
    orderBy: { submittedAt: "desc" },
    include: { stepTemplate: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-16 pt-8">
      <div className="mb-6">
        <Link href={`/talent/${talent.slug}`} className="text-xs text-gray-400 hover:underline">
          ← ロードマップに戻る
        </Link>
        <h1 className="mt-1 text-lg font-bold">提出履歴</h1>
        <p className="mt-1 text-sm text-gray-500">
          確認待ちの報告は内容を編集できます。承認・差し戻し済みの報告は編集できません。
        </p>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-gray-400">まだ完了報告はありません。</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <ReportHistoryItem key={r.id} slug={talent.slug} report={r} />
          ))}
        </div>
      )}
    </main>
  );
}
