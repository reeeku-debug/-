"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPatternAction,
  deletePatternAction,
  renamePatternAction,
  setDefaultPatternAction,
} from "@/app/admin/(dashboard)/patterns/actions";

type PatternLite = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  stepCount: number;
  talentCount: number;
};

export function PatternSwitcher({
  patterns,
  currentPatternId,
}: {
  patterns: PatternLite[];
  currentPatternId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [copyFromCurrent, setCopyFromCurrent] = useState(true);

  const current = patterns.find((p) => p.id === currentPatternId) ?? patterns[0];

  function handleSwitch(patternId: string) {
    router.push(`/admin/steps?pattern=${patternId}`);
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (copyFromCurrent) formData.set("sourcePatternId", currentPatternId);
    startTransition(async () => {
      const res = await createPatternAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setShowCreate(false);
      router.push(`/admin/steps?pattern=${res.patternId}`);
    });
  }

  function handleRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await renamePatternAction(current.id, formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setRenaming(false);
      router.refresh();
    });
  }

  function handleSetDefault() {
    setError(null);
    startTransition(async () => {
      const res = await setDefaultPatternAction(current.id);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`パターン「${current.name}」を削除します。よろしいですか？`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deletePatternAction(current.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      const remaining = patterns.filter((p) => p.id !== current.id);
      router.push(`/admin/steps?pattern=${remaining[0]?.id ?? ""}`);
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-500">パターン</label>
        <select
          value={current.id}
          onChange={(e) => handleSwitch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        >
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? "（既定）" : ""}（STEP{p.stepCount}件・利用{p.talentCount}名）
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          ＋ 新しいパターン
        </button>
        <button
          onClick={() => setRenaming((v) => !v)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          名前を編集
        </button>
        {!current.isDefault && (
          <button
            disabled={pending}
            onClick={handleSetDefault}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            既定に設定
          </button>
        )}
        {!current.isDefault && current.talentCount === 0 && (
          <button
            disabled={pending}
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            このパターンを削除
          </button>
        )}
      </div>

      {current.description && <p className="mt-2 text-xs text-gray-400">{current.description}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {renaming && (
        <form onSubmit={handleRename} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">パターン名</label>
            <input
              name="name"
              defaultValue={current.name}
              required
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">説明（任意）</label>
            <input
              name="description"
              defaultValue={current.description ?? ""}
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              保存する
            </button>
          </div>
        </form>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold text-gray-600">新しいパターンを作成</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">パターン名 *</label>
            <input
              name="name"
              required
              placeholder="例: 配信初心者向け"
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">説明（任意）</label>
            <input name="description" className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={copyFromCurrent}
              onChange={(e) => setCopyFromCurrent(e.target.checked)}
            />
            「{current.name}」のSTEP構成をコピーする（チェックを外すとGOALのみの空パターンになります）
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              作成する
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
