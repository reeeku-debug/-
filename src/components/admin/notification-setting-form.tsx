"use client";

import { useState } from "react";
import {
  sendTestNotificationAction,
  updateNotificationSettingAction,
} from "@/app/admin/(dashboard)/settings/actions";

export function NotificationSettingForm({
  webhookUrl: initialWebhookUrl,
  notifyOnReportSubmit,
  dailyDigestEnabled,
}: {
  webhookUrl: string;
  notifyOnReportSubmit: boolean;
  dailyDigestEnabled: boolean;
}) {
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await updateNotificationSettingAction(formData);
    setPending(false);
    if (!res.success) setError(res.error);
    else setSaved(true);
  }

  async function handleTest() {
    setTestResult(null);
    setTestPending(true);
    const res = await sendTestNotificationAction(webhookUrl);
    setTestPending(false);
    setTestResult(res.success ? { success: true } : { success: false, error: res.error });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Google Chat Webhook URL</label>
        <input
          name="googleChatWebhookUrl"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://chat.googleapis.com/v1/spaces/..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono text-xs focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
        <p className="mt-1 text-xs text-gray-400">
          通知を送りたいGoogle Chatのスペースで「アプリと統合」→「Webhookを管理」から作成したURLを貼り付けてください。空欄のままにすると通知は送信されません。
        </p>
      </div>

      <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        <input
          type="checkbox"
          name="notifyOnReportSubmit"
          defaultChecked={notifyOnReportSubmit}
          className="mt-0.5"
        />
        タレントが完了報告を送信した時に、その都度通知する
      </label>

      <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        <input
          type="checkbox"
          name="dailyDigestEnabled"
          defaultChecked={dailyDigestEnabled}
          className="mt-0.5"
        />
        <span>
          毎日13時に、未承認の完了報告をまとめて1通で通知する
          <br />
          <span className="text-gray-400">
            その時点で確認待ちのタレント・STEPを一覧にして1回だけ送信します（0件の日は送信しません）。
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm font-semibold text-emerald-600">✅ 保存しました</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存する"}
      </button>

      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleTest}
          disabled={testPending || !webhookUrl.trim()}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {testPending ? "送信中..." : "🔔 テスト送信"}
        </button>
        <p className="mt-1 text-xs text-gray-400">保存前でも、入力中のURLへテスト送信できます。</p>
        {testResult?.success && (
          <p className="mt-2 text-sm font-semibold text-emerald-600">
            ✅ 送信しました。Google Chatを確認してください。
          </p>
        )}
        {testResult && !testResult.success && <p className="mt-2 text-sm text-red-600">❌ {testResult.error}</p>}
      </div>
    </form>
  );
}
