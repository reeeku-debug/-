import Link from "next/link";
import type { TalentWithRelations } from "@/lib/search";
import { SOCIAL_PLATFORMS } from "@/lib/constants";
import { formatDate, formatFollowers, isStale } from "@/lib/utils";

export default function TalentTable({ talents }: { talents: TalentWithRelations[] }) {
  if (talents.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-400">該当する登録者が見つかりませんでした</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] table-fixed text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="w-32 px-4 py-3">芸名</th>
            <th className="w-56 px-4 py-3">実績</th>
            <th className="w-40 px-4 py-3">趣味</th>
            <th className="w-40 px-4 py-3">特技</th>
            <th className="w-48 px-4 py-3">最終的な夢</th>
            <th className="w-48 px-4 py-3">半年後の目標</th>
            <th className="w-44 px-4 py-3">やってみたい案件</th>
            <th className="w-44 px-4 py-3">SNS情報</th>
            <th className="w-28 px-4 py-3">最終更新日</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {talents.map((t) => {
            const stale = isStale(t.updatedAt);
            return (
              <tr key={t.id} className="align-top hover:bg-brand-50/40">
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/talents/${t.id}`} className="text-brand-600 hover:underline">
                    {t.stageName || "（未設定）"}
                  </Link>
                  {(!t.profile || t.profile.isDraft) && (
                    <span className="mt-1 block w-fit rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                      未送信
                    </span>
                  )}
                </td>
                <td className="truncate px-4 py-3 text-gray-600">
                  {t.achievements.map((a) => a.content).join("、") || "-"}
                </td>
                <td className="truncate px-4 py-3 text-gray-600">
                  {t.hobbies.map((h) => h.name).join("、") || "-"}
                </td>
                <td className="truncate px-4 py-3 text-gray-600">
                  {t.skills.map((s) => s.name).join("、") || "-"}
                </td>
                <td className="truncate px-4 py-3 text-gray-600">{t.profile?.finalDream || "-"}</td>
                <td className="truncate px-4 py-3 text-gray-600">{t.profile?.halfYearGoal || "-"}</td>
                <td className="truncate px-4 py-3 text-gray-600">
                  {t.desiredWorks.map((d) => d.name).join("、") || "-"}
                </td>
                <td className="truncate px-4 py-3 text-gray-600">
                  {t.socialAccounts.length === 0
                    ? "-"
                    : t.socialAccounts
                        .map((s) => {
                          const label =
                            s.platform === "OTHER"
                              ? s.label || "その他"
                              : SOCIAL_PLATFORMS.find((p) => p.value === s.platform)?.label;
                          return `${label}${s.followers ? `(${formatFollowers(s.followers)})` : ""}`;
                        })
                        .join(" / ")}
                </td>
                <td className="px-4 py-3">
                  <span className={stale ? "font-semibold text-amber-600" : "text-gray-500"}>
                    {formatDate(t.updatedAt)}
                  </span>
                  {stale && <span className="mt-1 block text-[10px] text-amber-600">要更新</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
