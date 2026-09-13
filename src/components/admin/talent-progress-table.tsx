import Link from "next/link";

export type TalentProgressRow = {
  id: string;
  name: string;
  activityName: string | null;
  total: number;
  cleared: number;
  currentStepTitle: string;
  stateLabel: "確認待ち" | "挑戦中" | "完了" | "-";
};

const STATE_BADGE: Record<TalentProgressRow["stateLabel"], string> = {
  確認待ち: "bg-sky-50 text-sky-700 border-sky-300",
  挑戦中: "bg-amber-50 text-amber-700 border-amber-300",
  完了: "bg-emerald-50 text-emerald-700 border-emerald-300",
  "-": "bg-gray-100 text-gray-400 border-gray-200",
};

export function TalentProgressTable({ rows }: { rows: TalentProgressRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
        まだタレントが登録されていません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 font-semibold">タレント</th>
            <th className="px-4 py-3 font-semibold">進捗</th>
            <th className="px-4 py-3 font-semibold">現在STEP</th>
            <th className="px-4 py-3 font-semibold">状態</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-semibold text-gray-900">{row.name}</p>
                {row.activityName && <p className="text-xs text-gray-400">{row.activityName}</p>}
              </td>
              <td className="px-4 py-3 font-mono text-sm text-gray-700">
                {row.cleared}/{row.total}
              </td>
              <td className="px-4 py-3 text-gray-600">{row.currentStepTitle}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_BADGE[row.stateLabel]}`}
                >
                  {row.stateLabel}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/talents/${row.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                  詳細を見る →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
