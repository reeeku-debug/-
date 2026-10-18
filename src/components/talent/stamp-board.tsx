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

function StampCircle({
  number,
  item,
  status,
  selected,
  onClick,
}: {
  number: number;
  item: StampItemLite;
  status: StampStatus;
  selected: boolean;
  onClick: () => void;
}) {
  const circleClass =
    status === "APPROVED"
      ? "border-brand-500 bg-brand-500 text-white shadow-md"
      : status === "PENDING"
        ? "border-sky-400 bg-sky-50 text-sky-600"
        : status === "REJECTED"
          ? "border-red-400 bg-red-50 text-red-500"
          : "border-dashed border-gray-300 bg-white text-gray-300";

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 ${selected ? "scale-105" : ""} transition-transform`}
    >
      <span
        className={`relative flex aspect-square w-full items-center justify-center rounded-full border-2 text-2xl leading-none ${circleClass} ${
          selected ? "ring-4 ring-brand-200" : ""
        }`}
      >
        {status === "APPROVED" ? (
          item.icon
        ) : (
          <span className={status === "NONE" ? "font-bold" : "font-bold opacity-70"}>{number}</span>
        )}
        {status === "APPROVED" && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs shadow">
            ✓
          </span>
        )}
        {status === "PENDING" && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-sky-300 bg-white text-[10px] shadow">
            ⏳
          </span>
        )}
        {status === "REJECTED" && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-red-300 bg-white text-[10px] shadow">
            ！
          </span>
        )}
      </span>
      <span className={`line-clamp-2 text-center text-[11px] font-semibold leading-tight ${status === "NONE" ? "text-gray-400" : "text-gray-700"}`}>
        {item.title}
      </span>
    </button>
  );
}

function StampDetailPanel({
  slug,
  item,
  status,
  latestClaim,
  onDone,
}: {
  slug: string;
  item: StampItemLite;
  status: StampStatus;
  latestClaim: LatestClaim;
  onDone: () => void;
}) {
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
    formRef.current?.reset();
    onDone();
  }

  return (
    <div className="mt-5 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="text-2xl leading-none">{item.icon}</span>
        <div>
          <p className="font-bold text-gray-900">{item.title}</p>
          {item.description && (
            <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{item.description}</p>
          )}
        </div>
      </div>

      {status === "APPROVED" && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-600">
          🏅 獲得済みのスタンプです！
        </p>
      )}

      {status === "PENDING" && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
          📨 マネージャー確認中！
        </p>
      )}

      {status === "REJECTED" && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-semibold">❌ 差し戻されました</p>
          {latestClaim?.reviewComment && <p className="mt-1">{latestClaim.reviewComment}</p>}
          <p className="mt-1 text-xs text-red-500">内容を確認して再度申請してください。</p>
        </div>
      )}

      {(status === "NONE" || status === "REJECTED") && (
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
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? "送信中..." : "送信する"}
          </button>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const earnedCount = items.filter((i) => statusMap.get(i.id) === "APPROVED").length;
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <section className="mt-10 rounded-3xl border-2 border-dashed border-brand-300 bg-gradient-to-b from-brand-50 to-white p-5 shadow-sm">
      <div className="text-center">
        <p className="text-lg font-extrabold text-brand-600">🎖️ スタンプラリー</p>
        <p className="mt-1 text-xs text-gray-500">スタンプを集めよう！</p>
        <div className="mx-auto mt-3 flex max-w-[180px] items-center gap-2">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
              style={{ width: `${items.length === 0 ? 0 : Math.round((earnedCount / items.length) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold text-brand-600">
            {earnedCount}/{items.length}
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4">
        {items.map((item, i) => (
          <StampCircle
            key={item.id}
            number={i + 1}
            item={item}
            status={statusMap.get(item.id) ?? "NONE"}
            selected={selectedId === item.id}
            onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
          />
        ))}
      </div>

      {selectedItem && (
        <StampDetailPanel
          slug={slug}
          item={selectedItem}
          status={statusMap.get(selectedItem.id) ?? "NONE"}
          latestClaim={latestClaimMap.get(selectedItem.id) ?? null}
          onDone={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}
