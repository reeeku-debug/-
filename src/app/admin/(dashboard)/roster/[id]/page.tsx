import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PAYMENT_STATUS_OPTIONS, TALENT_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { formatTalentNo } from "@/lib/roster";
import DeleteTalentRosterButton from "@/components/admin/delete-talent-roster-button";

export default async function TalentRosterDetailPage({ params }: { params: { id: string } }) {
  const talent = await prisma.talent.findUnique({
    where: { id: params.id },
    include: {
      company: true,
      bankAccount: true,
      paymentRecords: { include: { paymentMonth: true }, orderBy: { paymentMonth: { sortOrder: "asc" } } },
    },
  });
  if (!talent) notFound();

  const fullName = `${talent.lastName} ${talent.firstName}`;
  const fullNameKana =
    talent.lastNameKana || talent.firstNameKana
      ? `${talent.lastNameKana ?? ""} ${talent.firstNameKana ?? ""}`.trim()
      : "";
  const address = [talent.postalCode && `〒${talent.postalCode}`, talent.prefecture, talent.city, talent.addressLine]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/roster" className="text-sm text-gray-500 underline">
            ← タレント一覧に戻る
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            No.{formatTalentNo(talent.talentNo)} {fullName}
          </h1>
          <p className="text-sm text-gray-500">
            {fullNameKana && <span>{fullNameKana}　</span>}
            登録日：{formatDate(talent.registeredAt)}　最終更新：{formatDateTime(talent.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/roster/${talent.id}/edit`} className="btn-primary">
            編集する
          </Link>
          <DeleteTalentRosterButton talentId={talent.id} name={fullName} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="基本情報">
            <Row label="No.">{formatTalentNo(talent.talentNo)}</Row>
            <Row label="本名">{fullName}</Row>
            <Row label="読み方">{fullNameKana || "未入力"}</Row>
            <Row label="性別">{talent.gender || "未入力"}</Row>
            <Row label="所属事務所">{talent.company.name}</Row>
            <Row label="在籍状況">
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-semibold",
                  statusColor(TALENT_STATUS_OPTIONS, talent.status)
                )}
              >
                {statusLabel(TALENT_STATUS_OPTIONS, talent.status)}
              </span>
            </Row>
            <Row label="住所">{address || "未入力"}</Row>
          </Section>

          <Section title="銀行振込口座">
            <Row label="銀行名">{talent.bankAccount?.bankName || "未入力"}</Row>
            <Row label="支店名">{talent.bankAccount?.branchName || "未入力"}</Row>
            <Row label="口座種別">{talent.bankAccount?.accountType || "未入力"}</Row>
            <Row label="口座番号">{talent.bankAccount?.accountNumber || "未入力"}</Row>
            <Row label="口座名義">{talent.bankAccount?.accountHolder || "未入力"}</Row>
          </Section>
        </div>

        <div>
          <Section title="入金状況（月次）">
            {talent.paymentRecords.length === 0 ? (
              <p className="text-sm text-gray-400">入金月データがありません</p>
            ) : (
              <div className="max-h-[28rem] space-y-1 overflow-y-auto">
                {talent.paymentRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{r.paymentMonth.label}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-semibold",
                        statusColor(PAYMENT_STATUS_OPTIONS, r.status)
                      )}
                    >
                      {statusLabel(PAYMENT_STATUS_OPTIONS, r.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-gray-400">
              入金ステータスの編集機能は次フェーズで対応予定です。
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      <div className="mt-0.5 text-gray-800">{children}</div>
    </div>
  );
}
