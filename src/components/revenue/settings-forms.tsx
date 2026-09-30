"use client";

import { useFormState, useFormStatus } from "react-dom";
import { initSheetsAction, saveSettingsAction, type SaveState } from "@/app/admin/(dashboard)/revenue/actions";

function Submit({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary px-4 py-2 text-sm">
      {pending ? "処理中…" : label}
    </button>
  );
}

function Message({ state }: { state: SaveState }) {
  if (!state.message) return null;
  return <p className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{state.message}</p>;
}

export function ThresholdForm({
  fields,
  writable,
}: {
  fields: Array<{ key: string; label: string; value: number; unit: string }>;
  writable: boolean;
}) {
  const [state, action] = useFormState<SaveState, FormData>(saveSettingsAction, { ok: false, message: null });
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-700">{f.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              <input
                name={f.key}
                defaultValue={f.value}
                inputMode="numeric"
                className="w-24 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                disabled={!writable}
              />
              <span className="w-6 text-xs text-gray-500">{f.unit}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Submit label="アラート設定を保存" disabled={!writable} />
        <Message state={state} />
      </div>
    </form>
  );
}

export function InitSheetsForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useFormState<SaveState>(initSheetsAction, { ok: false, message: null });
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit label="不足しているシートを作成" disabled={!enabled} />
      <Message state={state} />
    </form>
  );
}
