"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "cur", label: "当月" },
  { value: "prev", label: "前月" },
  { value: "mtd", label: "今月累計" },
  { value: "month", label: "月を指定" },
  { value: "custom", label: "任意期間" },
];

export default function PeriodSelector({
  months,
  label,
  compareLabel,
}: {
  /** 選択肢の年月（新しい順, YYYY-MM） */
  months: string[];
  label: string;
  compareLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("p") ?? "cur";
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const navigate = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    if (q.get("p") === "cur") q.delete("p");
    router.push(`${pathname}${q.toString() ? `?${q.toString()}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-gray-600">期間</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 bg-white">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              if (o.value === "month") navigate({ p: "month", m: params.get("m") ?? months[0], from: null, to: null });
              else if (o.value === "custom") navigate({ p: "custom", m: null, from: from || null, to: to || null });
              else navigate({ p: o.value, m: null, from: null, to: null });
            }}
            className={cn(
              "border-r border-gray-200 px-3 py-1.5 last:border-r-0",
              current === o.value ? "bg-brand-500 text-white" : "text-gray-700 hover:bg-gray-50"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {current === "month" && (
        <select
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5"
          value={params.get("m") ?? months[0]}
          onChange={(e) => navigate({ p: "month", m: e.target.value })}
          aria-label="対象月"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace("-", "年")}月
            </option>
          ))}
        </select>
      )}
      {current === "custom" && (
        <form
          className="flex flex-wrap items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ p: "custom", from, to });
          }}
        >
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" aria-label="開始日" required />
          <span className="text-gray-400">〜</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" aria-label="終了日" required />
          <button type="submit" className="rounded-lg bg-gray-800 px-3 py-1.5 text-white">表示</button>
        </form>
      )}
      <span className="w-full text-xs text-gray-500 md:w-auto md:pl-2">
        表示中：<span className="font-semibold text-gray-700">{label}</span>／比較：{compareLabel}
      </span>
    </div>
  );
}
