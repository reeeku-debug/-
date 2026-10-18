"use client";

import { useState, useTransition } from "react";
import {
  deleteStampItemAction,
  reorderStampItemAction,
  toggleStampItemActiveAction,
  updateStampItemAction,
} from "@/app/admin/(dashboard)/stamps/actions";
import { StampClaimReviewCard } from "./stamp-claim-review-card";

type ItemLite = {
  id: string;
  order: number;
  icon: string;
  title: string;
  description: string | null;
  active: boolean;
};

type ClaimLite = {
  id: string;
  comment: string | null;
  imageUrl: string | null;
  relatedUrl: string | null;
  submittedAt: Date;
  talent: { id: string; name: string; managementNo: string | null };
};

export function StampItemCard({
  item,
  pendingClaims,
  earnedCount,
  isFirst,
  isLast,
}: {
  item: ItemLite;
  pendingClaims: ClaimLite[];
  earnedCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const remainingClaims = pendingClaims.filter((c) => !doneIds.has(c.id));

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateStampItemAction(item.id, formData);
      if (!res.success) setError(res.error);
      else setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm(`「${item.title}」を削除します。これまでの申請履歴も削除されます。よろしいですか？`)) return;
    startTransition(async () => {
      const res = await deleteStampItemAction(item.id);
      if (!res.success) setError(res.error);
    });
  }

  function handleToggle() {
    startTransition(async () => {
      const res = await toggleStampItemActiveAction(item.id);
      if (!res.success) setError(res.error);
    });
  }

  function handleReorder(direction: "up" | "down") {
    startTransition(async () => {
      const res = await reorderStampItemAction(item.id, direction);
      if (!res.success) setError(res.error);
    });
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${item.active ? "border-gray-200" : "border-gray-200 opacity-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="text-lg leading-none">{item.icon}</span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-bold">{item.title}</p>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                🏅 獲得{earnedCount}名
              </span>
            </div>
            {item.description && (
              <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{item.description}</p>
            )}
            {!item.active && <p className="mt-1 text-xs font-semibold text-gray-400">（無効）</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            disabled={pending || isFirst}
            onClick={() => handleReorder("up")}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            disabled={pending || isLast}
            onClick={() => handleReorder("down")}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {!editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            編集する
          </button>
          <button
            disabled={pending}
            onClick={handleToggle}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {item.active ? "無効化する" : "有効化する"}
          </button>
          <button
            disabled={pending}
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            削除する
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <div className="w-20">
              <label className="mb-1 block text-xs font-medium text-gray-600">アイコン</label>
              <input
                name="icon"
                defaultValue={item.icon}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">スタンプ名</label>
              <input
                name="title"
                defaultValue={item.title}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">達成条件の説明（任意）</label>
            <textarea
              name="description"
              defaultValue={item.description ?? ""}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {pending ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      )}

      {remainingClaims.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-sky-700">📨 確認待ち {remainingClaims.length}件</p>
          {remainingClaims.map((c) => (
            <StampClaimReviewCard
              key={c.id}
              claim={c}
              onDone={() => setDoneIds((prev) => new Set(prev).add(c.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
