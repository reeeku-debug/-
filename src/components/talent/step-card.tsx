"use client";

import { useRef, useState } from "react";
import { submitStepReportAction } from "@/app/talent/[slug]/actions";
import { STEP_STATUS_BADGE_CLASS, STEP_STATUS_LABEL } from "@/lib/constants";

export type StepStatus = "LOCKED" | "CHALLENGE" | "REVIEW" | "CLEAR";

type LatestReport = {
  status: string;
  reviewComment: string | null;
  comment: string | null;
  imageUrl: string | null;
  relatedUrl: string | null;
} | null;

type StepLite = {
  id: string;
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  type: string;
};

export function RoadmapStepCard({
  step,
  status,
  latestReport,
  isLast,
}: {
  step: StepLite;
  status: StepStatus;
  latestReport: LatestReport;
  isLast: boolean;
}) {
  const isGoal = step.type === "GOAL";
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const result = await submitStepReportAction(formData);

    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOpen(false);
    formRef.current?.reset();
  }

  const badgeClass = STEP_STATUS_BADGE_CLASS[status];
  const badgeLabel = isGoal
    ? status === "CLEAR"
      ? "達成"
      : "未到達"
    : STEP_STATUS_LABEL[status];

  return (
    <li className="relative pb-8 pl-10 last:pb-0">
      {!isLast && (
        <span
          className={`absolute left-[15px] top-8 h-full w-0.5 ${
            status === "CLEAR" ? "bg-brand-400" : "bg-gray-200"
          }`}
        />
      )}
      <span
        className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm ${
          status === "CLEAR"
            ? "border-brand-500 bg-brand-500 text-white"
            : status === "LOCKED"
              ? "border-gray-300 bg-white text-gray-300"
              : "border-brand-400 bg-white text-brand-500"
        }`}
      >
        {status === "CLEAR" ? "✓" : status === "LOCKED" ? "🔒" : isGoal ? "🏆" : "●"}
      </span>

      <div
        className={`rounded-2xl border p-4 shadow-sm transition ${
          status === "LOCKED" ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
        } ${isGoal && status === "CLEAR" ? "border-amber-300 bg-amber-50" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="text-xl leading-none">{step.icon}</span>
            <div>
              <p className={`font-bold ${status === "LOCKED" ? "text-gray-400" : "text-gray-900"}`}>
                {step.title}
              </p>
              {status !== "LOCKED" && (
                <p className="mt-1 whitespace-pre-line text-sm text-gray-500">{step.description}</p>
              )}
            </div>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
            {badgeLabel}
          </span>
        </div>

        {status === "REVIEW" && (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
            📨 管理者確認中！
          </p>
        )}

        {status === "CHALLENGE" && latestReport?.status === "REJECTED" && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">❌ 差し戻されました</p>
            {latestReport.reviewComment && <p className="mt-1">{latestReport.reviewComment}</p>}
            <p className="mt-1 text-xs text-red-500">内容を確認して再度送信してください。</p>
          </div>
        )}

        {status === "CLEAR" && !isGoal && (
          <p className="mt-3 text-sm font-semibold text-brand-600">🎉 スタンプGET！</p>
        )}

        {status === "CHALLENGE" && !open && (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
          >
            {step.buttonLabel}
          </button>
        )}

        {status === "CHALLENGE" && open && (
          <form ref={formRef} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="stepTemplateId" value={step.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">コメント</label>
              <textarea
                name="comment"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="達成した内容を入力してください"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                証拠画像（任意）
              </label>
              <input
                type="file"
                name="image"
                accept="image/*"
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                関連URL（X投稿URLなど・任意）
              </label>
              <input
                type="url"
                name="relatedUrl"
                placeholder="https://x.com/..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
              >
                {pending ? "送信中..." : "送信する"}
              </button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}
