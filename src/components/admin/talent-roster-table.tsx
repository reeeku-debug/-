import Link from "next/link";
import type { TalentRosterWithRelations } from "@/lib/roster";
import { currentMonthPaymentRecord, formatTalentNo } from "@/lib/roster";
import { PAYMENT_STATUS_OPTIONS, TALENT_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function TalentRosterTable({ talents }: { talents: TalentRosterWithRelations[] }) {
  if (talents.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-400">該当するタレントが見つかりませんでした</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[900px] table-fixed text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="w-16 px-4 py-3">No.</th>
            <th className="w-32 px-4 py-3">本名</th>
            <th className="w-32 px-4 py-3">読み方</th>
            <th className="w-20 px-4 py-3">性別</th>
            <th className="w-32 px-4 py-3">所属事務所</th>
            <th className="w-24 px-4 py-3">在籍状況</th>
            <th className="w-28 px-4 py-3">当月入金状況</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {talents.map((t) => {
            const payment = currentMonthPaymentRecord(t);
            return (
              <tr key={t.id} className="align-top hover:bg-brand-50/40">
                <td className="px-4 py-3 font-mono text-gray-500">{formatTalentNo(t.talentNo)}</td>
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/roster/${t.id}`} className="text-brand-600 hover:underline">
                    {t.lastName} {t.firstName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {t.lastNameKana || t.firstNameKana
                    ? `${t.lastNameKana ?? ""} ${t.firstNameKana ?? ""}`.trim()
                    : "-"}
                </td>
                <td className="px-4 py-3 text-gray-600">{t.gender || "-"}</td>
                <td className="px-4 py-3 text-gray-600">{t.company.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-semibold",
                      statusColor(TALENT_STATUS_OPTIONS, t.status)
                    )}
                  >
                    {statusLabel(TALENT_STATUS_OPTIONS, t.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {payment ? (
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-semibold",
                        statusColor(PAYMENT_STATUS_OPTIONS, payment.status)
                      )}
                    >
                      {statusLabel(PAYMENT_STATUS_OPTIONS, payment.status)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">未設定</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
