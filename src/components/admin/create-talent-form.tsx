"use client";

import { useState } from "react";
import Link from "next/link";
import { createTalentAction } from "@/app/admin/(dashboard)/talents/actions";
import { CopyButton } from "@/components/copy-button";

export function CreateTalentForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    talentId: string;
    loginId: string;
    password: string;
    slug: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await createTalentAction(formData);
    setPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setResult(res);
  }

  if (result) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/talent/${result.slug}`;
    const shareText = `ログインID: ${result.loginId}\nパスワード: ${result.password}\n専用URL: ${url}`;

    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
        <p className="font-bold text-emerald-700">✅ タレントを登録しました</p>
        <p className="mt-1 text-xs text-emerald-600">
          パスワードはこの画面でのみ表示されます。控えて本人に共有してください。
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-gray-500">ログインID</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono font-semibold">{result.loginId}</span>
              <CopyButton value={result.loginId} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-gray-500">初期パスワード</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono font-semibold">{result.password}</span>
              <CopyButton value={result.password} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-gray-500">専用URL</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-xs">{url}</span>
              <CopyButton value={url} />
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton value={shareText} label="3つまとめてコピー（共有用）" />
        </div>
        <Link
          href={`/admin/talents/${result.talentId}`}
          className="mt-5 inline-block rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
        >
          タレント詳細へ →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">タレント名 *</label>
        <input
          name="name"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">No.（任意・管理用）</label>
        <input
          name="managementNo"
          placeholder="例: 001"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
        <p className="mt-1 text-xs text-gray-400">マネージャー側でのみ表示されます。タレント本人には見えません。</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">本名（任意）</label>
        <input
          name="activityName"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">活動開始月（任意）</label>
        <input
          type="month"
          name="startMonth"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">初配信予定日（任意）</label>
        <input
          type="date"
          name="firstStreamDate"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          ログインID（空欄で自動生成）
        </label>
        <input
          name="loginId"
          placeholder="例: mirune"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">備考（任意）</label>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "登録中..." : "登録してログイン情報を発行"}
      </button>
    </form>
  );
}
