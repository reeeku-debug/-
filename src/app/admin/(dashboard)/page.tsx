import Link from "next/link";
import { getRegistrantStats, listRegistrants } from "@/lib/registrants";
import { formatDateTimeJST } from "@/lib/date";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [stats, registrants] = await Promise.all([
    getRegistrantStats(),
    listRegistrants(),
  ]);
  const recent = registrants.slice(0, 8);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">REALITY新規登録管理</h1>
      <p className="mt-1 text-sm text-gray-500">
        新規登録者の登録状況をリアルタイムで確認できます。
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="累計登録者数" value={`${stats.total}人`} />
        <StatCard label="今日の登録者数" value={`${stats.today}人`} />
        <StatCard label="今月の登録者数" value={`${stats.thisMonth}人`} />
        <StatCard
          label="最新登録者"
          value={stats.latest ? stats.latest.stageName : "-"}
        />
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">最新登録者一覧</h2>
          <Link
            href="/admin/registrants"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            全件を見る →
          </Link>
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <tr>
                <th className="px-4 py-3">登録日時</th>
                <th className="px-4 py-3">提出者</th>
                <th className="px-4 py-3">活動名</th>
                <th className="px-4 py-3">REALITY ID</th>
                <th className="px-4 py-3">本名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    まだ登録者がいません
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatDateTimeJST(r.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.submitter}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    {r.stageName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.realityId}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.realName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
