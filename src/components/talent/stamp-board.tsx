"use client";

import { useRef, useState } from "react";
import { submitStampClaimAction } from "@/app/talent/[slug]/actions";

export type StampStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

type LatestClaim = {
  reviewComment: string | null;
} | null;

type StampItemLite = {
  id: string;
  icon: string;
  title: string;
  description: string | null;
};

function StampCard({
  slug,
  item,
  status,
  latestClaim,
}: {
  slug: string;
  item: StampItemLite;
  status: StampStatus;
  latestClaim: LatestClaim;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await submitStampClaimAction(formData);
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOpen(false);
    formRef.current?.reset();
  }

  const badgeClass =
    status === "APPROVED"
      ? "border-amber-400 bg-amber-50"
      : status === "PENDING"
        ? "border-sky-300 bg-sky-50"
        : status === "REJECTED"
          ? "border-red-300 bg-white"
          : "border-gray-200 bg-gray-50";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition ${badgeClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className={`text-2xl leading-none ${status === "NONE" ? "opacity-30 grayscale" : ""}`}>
            {item.icon}
          </span>
          <div>
            <p className={`font-bold ${status === "NONE" ? "text-gray-400" : "text-gray-900"}`}>{item.title}</p>
            {item.description && (
              <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{item.description}</p>
            )}
          </div>
        </div>
        {status === "APPROVED" && (
          <span className="shrink-0 rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
            🏅 獲得済み
          </span>
        )}
        {status === "PENDING" && (
          <span className="shrink-0 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
            確認待ち
          </span>
        )}
      </div>

      {status === "REJECTED" && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-semibold">❌ 差し戻されました</p>
          {latestClaim?.reviewComment && <p className="mt-1">{latestClaim.reviewComment}</p>}
          <p className="mt-1 text-xs text-red-500">内容を確認して再度申請してください。</p>
        </div>
      )}

      {(status === "NONE" || status === "REJECTED") && !open && (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
        >
          スタンプを申請する
        </button>
      )}

      {(status === "NONE" || status === "REJECTED") && open && (
        <form ref={formRef} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="stampItemId" value={item.id} />
          <input type="hidden" name="slug" value={slug} />
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
            <label className="mb-1 block text-xs font-medium text-gray-600">画像（任意）</label>
            <input
              type="file"
              name="image"
              accept="image/*"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">関連URL（任意）</label>
            <input
              type="url"
              name="relatedUrl"
              placeholder="https://..."
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
  );
}

export function StampBoard({
  slug,
  items,
  statusMap,
  latestClaimMap,
}: {
  slug: string;
  items: StampItemLite[];
  statusMap: Map<string, StampStatus>;
  latestClaimMap: Map<string, LatestClaim>;
}) {
  if (items.length === 0) return null;

  const earnedCount = items.filter((i) => statusMap.get(i.id) === "APPROVED").length;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">🎖️ スタンプラリー</h2>
        <span className="text-sm font-semibold text-gray-500">
          {earnedCount} / {items.length} 獲得
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <StampCard
            key={item.id}
            slug={slug}
            item={item}
            status={statusMap.get(item.id) ?? "NONE"}
            latestClaim={latestClaimMap.get(item.id) ?? null}
          />
        ))}
      </div>
    </section>
  );
}
