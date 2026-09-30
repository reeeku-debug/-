"use client";

import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { saveKpisAction, type SaveState } from "@/app/admin/(dashboard)/revenue/actions";

export interface KpiEditorItem {
  key: string;
  label: string;
  unit: "yen" | "person";
  description: string;
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary px-4 py-2 text-sm">
      {pending ? "保存中…" : "この月のKPIを保存"}
    </button>
  );
}

export default function KpiEditor({
  month,
  months,
  scopes,
  items,
  values,
  writable,
}: {
  month: string;
  months: string[];
  /** field はフォーム項目名に使うASCIIのキー */
  scopes: Array<{ id: string; label: string; field: string }>;
  items: KpiEditorItem[];
  /** `${scope}|${item}` → 目標値 */
  values: Record<string, number>;
  writable: boolean;
}) {
  const router = useRouter();
  const [state, action] = useFormState<SaveState, FormData>(saveKpisAction, { ok: false, message: null });

  return (
    <form action={action} className="space-y-4" key={month}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="kpi-month" className="font-medium text-gray-600">対象月</label>
        <select
          id="kpi-month"
          name="month"
          value={month}
          onChange={(e) => router.push(`/admin/revenue/kpi?p=month&m=${e.target.value}`)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace("-", "年")}月
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-2 text-left font-medium">KPI項目</th>
              {scopes.map((s) => (
                <th key={s.id} className="py-2 text-right font-medium">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.key}>
                <td className="py-2">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.description}</p>
                </td>
                {scopes.map((s) => (
                  <td key={s.id} className="py-2 pl-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {item.unit === "yen" && <span className="text-gray-400">¥</span>}
                      <input
                        name={`kpi__${s.field}__${item.key}`}
                        inputMode="numeric"
                        defaultValue={values[`${s.id}|${item.key}`] ?? ""}
                        placeholder="未設定"
                        className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-right tabular-nums"
                        disabled={!writable}
                      />
                      {item.unit === "person" && <span className="text-gray-400">人</span>}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        「全体」を空欄にすると、アプリ別目標の合計を全体目標として使います。「タレント売上」はそのアプリの各タレントのデフォルト目標で、
        タレント詳細ページから個別に上書きできます。
      </p>
      <div className="flex items-center gap-3">
        <Submit disabled={!writable} />
        {state.message && <p className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{state.message}</p>}
      </div>
    </form>
  );
}
