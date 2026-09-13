"use client";

import { useState } from "react";
import { updateStepReportAction } from "@/app/talent/[slug]/actions";
import { REPORT_STATUS_LABEL } from "@/lib/constants";
import { formatDateJST } from "@/lib/utils";

type ReportLite = {
  id: string;
  status: string;
  comment: string | null;
  imageUrl: string | null;
  relatedUrl: string | null;
  reviewComment: string | null;
  submittedAt: Date;
  stepTemplate: { icon: string; title: string };
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING: "border-sky-300 bg-sky-50 text-sky-700",
  APPROVED: "border-emerald-300 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-300 bg-red-50 text-red-700",
};

export function ReportHistoryItem({ slug, report }: { slug: string; report: ReportLite }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await updateStepReportAction(formData);
    setPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">
            {report.stepTemplate.icon} {report.stepTemplate.title}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{formatDateJST(report.submittedAt)} 送信</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[report.status]}`}
        >
          {REPORT_STATUS_LABEL[report.status]}
        </span>
      </div>

      {!editing ? (
        <>
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
              className="mt-3 max-h-48 rounded-lg border border-gray-200 object-contain"
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
          {report.status === "REJECTED" && report.reviewComment && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              差し戻し理由: {report.reviewComment}
            </p>
          )}
          {report.status === "PENDING" && (
            <button
              onClick={() => setEditing(true)}
              className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              編集する
            </button>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="reportId" value={report.id} />
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">コメント</label>
            <textarea
              name="comment"
              defaultValue={report.comment ?? ""}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">証拠画像</label>
            <input
              type="file"
              name="image"
              accept="image/*"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
            {report.imageUrl && (
              <p className="mt-1 text-xs text-gray-400">※選び直さなければ、現在の画像のままになります</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">関連URL</label>
            <input
              type="url"
              name="relatedUrl"
              defaultValue={report.relatedUrl ?? ""}
              placeholder="https://x.com/..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
            >
              {pending ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
