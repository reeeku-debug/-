"use client";

import { useState, useTransition } from "react";
import {
  deleteStepAction,
  reorderStepAction,
  toggleStepActiveAction,
  updateStepAction,
} from "@/app/admin/(dashboard)/steps/actions";

type StepLite = {
  id: string;
  order: number;
  key: string;
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  type: string;
  active: boolean;
};

export function StepManageCard({
  step,
  displayNumber,
  isFirst,
  isLast,
}: {
  step: StepLite;
  displayNumber: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isGoal = step.type === "GOAL";

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateStepAction(step.id, formData);
      if (!res.success) setError(res.error);
      else setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm(`「${step.title}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      const res = await deleteStepAction(step.id);
      if (!res.success) setError(res.error);
    });
  }

  function handleToggle() {
    startTransition(async () => {
      const res = await toggleStepActiveAction(step.id);
      if (!res.success) setError(res.error);
    });
  }

  function handleReorder(direction: "up" | "down") {
    startTransition(async () => {
      const res = await reorderStepAction(step.id, direction);
      if (!res.success) setError(res.error);
    });
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${step.active ? "border-gray-200" : "border-gray-200 opacity-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-xs font-mono text-gray-400">
            {isGoal ? "GOAL" : `STEP${displayNumber}`}
          </span>
          <span className="text-lg leading-none">{step.icon}</span>
          <div>
            <p className="font-bold">{step.title}</p>
            <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{step.description}</p>
            {!step.active && <p className="mt-1 text-xs font-semibold text-gray-400">（無効）</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {!isGoal && (
            <div className="flex gap-1">
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
          )}
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
          {!isGoal && (
            <>
              <button
                disabled={pending}
                onClick={handleToggle}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {step.active ? "無効化する" : "有効化する"}
              </button>
              <button
                disabled={pending}
                onClick={handleDelete}
                className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                削除する
              </button>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <div className="w-20">
              <label className="mb-1 block text-xs font-medium text-gray-600">アイコン</label>
              <input
                name="icon"
                defaultValue={step.icon}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">STEP名</label>
              <input
                name="title"
                defaultValue={step.title}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">内容・達成条件</label>
            <textarea
              name="description"
              defaultValue={step.description}
              rows={3}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          {!isGoal && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ボタン文言</label>
              <input
                name="buttonLabel"
                defaultValue={step.buttonLabel}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          )}
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
    </div>
  );
}
