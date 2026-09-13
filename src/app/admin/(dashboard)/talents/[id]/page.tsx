import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateOnlyJST, formatDateJST } from "@/lib/utils";
import { REPORT_STATUS_LABEL } from "@/lib/constants";
import { getRequestOrigin } from "@/lib/request";
import { summarizeTalentProgress } from "@/lib/progress";
import { AdminStepRow } from "@/components/admin/admin-step-row";
import { ReportReviewCard } from "@/components/admin/report-review-card";
import { DeleteTalentButton } from "@/components/admin/delete-talent-button";
import { ResetPasswordButton } from "@/components/admin/reset-password-button";
import { CopyButton } from "@/components/copy-button";

export default async function TalentDetailPage({ params }: { params: { id: string } }) {
  const talent = await prisma.talent.findUnique({ where: { id: params.id } });
  if (!talent) notFound();

  const [steps, statuses, pendingReports, historyReports] = await Promise.all([
    prisma.stepTemplate.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.talentStepStatus.findMany({ where: { talentId: talent.id } }),
    prisma.stepReport.findMany({
      where: { talentId: talent.id, status: "PENDING" },
      orderBy: { submittedAt: "asc" },
      include: { talent: true, stepTemplate: true },
    }),
    prisma.stepReport.findMany({
      where: { talentId: talent.id, status: { not: "PENDING" } },
      orderBy: { submittedAt: "desc" },
      include: { stepTemplate: true },
    }),
  ]);

  const statusMap = new Map(statuses.map((s) => [s.stepTemplateId, s.status]));
  const summary = summarizeTalentProgress(steps, statusMap);
  const talentUrl = `${getRequestOrigin()}/talent/${talent.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/talents" className="text-xs text-gray-400 hover:underline">
            ← タレント一覧
          </Link>
          <h1 className="mt-1 text-xl font-bold">{talent.name}さんの進捗</h1>
          {talent.activityName && <p className="text-sm text-gray-500">活動名: {talent.activityName}</p>}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/talents/${talent.id}/edit`}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            情報を編集
          </Link>
          <DeleteTalentButton talentId={talent.id} talentName={talent.name} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">進捗</p>
          <p className="mt-1 text-2xl font-extrabold">
            {summary.cleared}/{summary.total}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">現在STEP</p>
          <p className="mt-1 text-lg font-bold">{summary.currentStepTitle}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">状態</p>
          <p className="mt-1 text-lg font-bold">{summary.stateLabel}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-500">ログイン情報</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-400">ログインID</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono font-semibold">{talent.loginId}</span>
              <CopyButton value={talent.loginId} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">専用URL</dt>
            <dd className="flex items-center gap-2">
              <span className="truncate font-mono text-xs">{talentUrl}</span>
              <CopyButton value={talentUrl} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">初配信予定日</dt>
            <dd>{formatDateOnlyJST(talent.firstStreamDate)}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <ResetPasswordButton talentId={talent.id} />
        </div>
        {talent.notes && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p className="text-xs font-semibold text-gray-400">備考</p>
            <p className="mt-1 whitespace-pre-line">{talent.notes}</p>
          </div>
        )}
      </div>

      {pendingReports.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-500">📨 確認待ちの完了報告</h2>
          <div className="space-y-3">
            {pendingReports.map((r) => (
              <ReportReviewCard key={r.id} report={r} showTalentName={false} />
            ))}
          </div>
        </div>
      )}

      {historyReports.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-500">過去の報告履歴</h2>
          <div className="space-y-2">
            {historyReports.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {r.stepTemplate.icon} {r.stepTemplate.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{formatDateJST(r.submittedAt)} 送信</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      r.status === "APPROVED"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-red-300 bg-red-50 text-red-700"
                    }`}
                  >
                    {REPORT_STATUS_LABEL[r.status]}
                  </span>
                </div>
                {r.comment && <p className="mt-2 whitespace-pre-line text-sm text-gray-600">{r.comment}</p>}
                {r.relatedUrl && (
                  <a
                    href={r.relatedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block truncate text-sm text-brand-600 underline"
                  >
                    {r.relatedUrl}
                  </a>
                )}
                {r.status === "REJECTED" && r.reviewComment && (
                  <p className="mt-2 text-xs text-red-600">差し戻し理由: {r.reviewComment}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500">STEP別の直接操作</h2>
        <div className="space-y-2">
          {steps.map((step) => (
            <AdminStepRow
              key={step.id}
              talentId={talent.id}
              step={step}
              status={statusMap.get(step.id) ?? "LOCKED"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
