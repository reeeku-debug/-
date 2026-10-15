"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveCriteriaAction, type SaveState } from "@/app/(dashboard)/actions";
import type { Criteria } from "@/lib/reality/tier";
import { cn } from "@/lib/utils";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary px-5 py-2 text-sm">
      {pending ? "保存中…" : "保存"}
    </button>
  );
}

const FIELDS: Array<{ name: keyof Criteria; label: string; step: number; scale?: number }> = [
  { name: "hours", label: "基本条件：月の配信時間（h）", step: 1 },
  { name: "events", label: "基本条件：月のイベント参加数", step: 1 },
  { name: "t1", label: "T1：3ヶ月平均の月売上（円）", step: 10000 },
  { name: "t2", label: "T2：3ヶ月平均の月売上（円）", step: 10000 },
  { name: "t3", label: "T3：月売上（円）", step: 10000 },
  { name: "rate", label: "会社への還元率（%）", step: 1, scale: 100 },
];

export default function CriteriaForm({ criteria }: { criteria: Criteria }) {
  const [state, action] = useFormState<SaveState, FormData>(saveCriteriaAction, { ok: false, message: null });
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.name} className="block text-sm">
            <span className="mb-1 block text-xs text-gray-600">{f.label}</span>
            <input
              type="number"
              name={f.name}
              min={0}
              step={f.step}
              required
              defaultValue={Math.round(Number(criteria[f.name]) * (f.scale ?? 1) * 100) / 100}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 tabular-nums"
            />
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rescue" defaultChecked={criteria.rescue} className="mt-1" />
        <span>既存タレントの救済：デビュー4ヶ月目以降でも、直近3ヶ月に T3 の月売上がある人は T3 にする</span>
      </label>
      <div className="flex items-center gap-3">
        <Submit />
        {state.message && <span className={cn("text-sm", state.ok ? "text-emerald-700" : "text-red-600")}>{state.message}</span>}
      </div>
    </form>
  );
}
