"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveTalentKpiAction, type SaveState } from "@/app/(dashboard)/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">
      {pending ? "保存中…" : "保存"}
    </button>
  );
}

export default function TalentKpiForm({
  app,
  talentId,
  month,
  current,
}: {
  app: string;
  talentId: string;
  month: string;
  current: number | null;
}) {
  const [state, action] = useFormState<SaveState, FormData>(saveTalentKpiAction, { ok: false, message: null });
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="app" value={app} />
      <input type="hidden" name="talentId" value={talentId} />
      <input type="hidden" name="month" value={month} />
      <label className="block text-xs text-gray-500">{month.replace("-", "年")}月の個別売上目標（空欄で個別設定を削除）</label>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">¥</span>
        <input
          name="target"
          inputMode="numeric"
          defaultValue={current ?? ""}
          className="w-40 rounded-lg border border-gray-300 px-2 py-1.5 text-right"
          placeholder="例: 100000"
        />
        <Submit />
      </div>
      {state.message && <p className={state.ok ? "text-emerald-700" : "text-red-600"}>{state.message}</p>}
    </form>
  );
}
