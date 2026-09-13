"use client";

import { useState, useTransition } from "react";
import { approveReportAction, rejectReportAction } from "@/app/admin/(dashboard)/reports/actions";
import { formatDateJST } from "@/lib/utils";

type ReportLite = {
  id: string;
  comment: string | null;
  imageUrl: string | null;
  relatedUrl: string | null;
  submittedAt: Date;
  talent: { id: string; name: string; managementNo: string | null };
  stepTemplate: { title: string; icon: string };
};

export function ReportReviewCard({
  report,
  showTalentName = true,
}: {
  report: ReportLite;
  showTalentName?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveReportAction(report.id);
      if (!res.success) setError(res.error);
      else setDone(true);
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectReportAction(report.id, reason);
      if (!res.success) setError(res.error);
      else setDone(true);
    });
  }

  if (done) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          {showTalentName && (
            <p className="text-xs font-semibold text-gray-400">
              {report.talent.managementNo && (
                <span className="mr-1 font-mono">No.{report.talent.managementNo}</span>
              )}
              {report.talent.name}さん
            </p>
          )}
          <p className="mt-0.5 font-bold">
            {report.stepTemplate.icon} STEP: {report.stepTemplate.title}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{formatDateJST(report.submittedAt)} 送信</p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
          確認待ち
        </span>
      </div>

      {report.comment && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          {report.comment}
        </p>
      )}
      {report.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={report.imageUrl}
          alt="添付画像"
          className="mt-3 max-h-64 rounded-lg border border-gray-200 object-contain"
        />
      )}
      {report.relatedUrl && (
        <a
          href={report.relatedUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block truncate text-sm text-brand-600 underline"
        >
          {report.relatedUrl}
        </a>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!rejecting ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleApprove}
            disabled={pending}
            className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            ✅ 承認する
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="flex-1 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            ❌ 差し戻す
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="差し戻し理由（任意）"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setRejecting(false)}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleReject}
              disabled={pending}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            >
              {pending ? "送信中..." : "差し戻す"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
