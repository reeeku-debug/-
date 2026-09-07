import Link from "next/link";
import { formatDateOnlyJST } from "@/lib/utils";
import { DeleteTalentButton } from "./delete-talent-button";

type TalentRow = {
  id: string;
  name: string;
  loginId: string;
  slug: string;
  activityName: string | null;
  firstStreamDate: Date | null;
};

export function TalentManageTable({ talents }: { talents: TalentRow[] }) {
  if (talents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
        まだタレントが登録されていません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 font-semibold">タレント名</th>
            <th className="px-4 py-3 font-semibold">ログインID</th>
            <th className="px-4 py-3 font-semibold">専用URL</th>
            <th className="px-4 py-3 font-semibold">初配信予定日</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {talents.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-semibold text-gray-900">{t.name}</p>
                {t.activityName && <p className="text-xs text-gray-400">{t.activityName}</p>}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.loginId}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">/talent/{t.slug}</td>
              <td className="px-4 py-3 text-gray-600">{formatDateOnlyJST(t.firstStreamDate)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <Link href={`/admin/talents/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                    詳細
                  </Link>
                  <Link href={`/admin/talents/${t.id}/edit`} className="text-xs font-semibold text-gray-500 hover:underline">
                    編集
                  </Link>
                  <DeleteTalentButton talentId={t.id} talentName={t.name} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
