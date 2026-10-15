"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { APPS } from "@/lib/revenue/apps";
import type { TalentRow } from "@/lib/revenue/analytics";
import { formatDateJp, hoursMinutes, percent, signedPercent, trendClass, yen } from "@/lib/revenue/format";
import { TALENT_FLAG_LABEL, TALENT_STATUSES, type TalentFlag } from "@/lib/revenue/types";

type SortKey = "revenue" | "change" | "streamDays" | "kpiRate" | "registeredAt" | "cumulativeRevenue" | "streamMinutes";

const SORT_LABEL: Record<SortKey, string> = {
  revenue: "売上順",
  change: "前月比順",
  streamDays: "配信日数順",
  kpiRate: "KPI達成率順",
  registeredAt: "登録日順",
  cumulativeRevenue: "累計収益順",
  streamMinutes: "配信時間順",
};

function sortValue(r: TalentRow, key: SortKey): number | string | null {
  switch (key) {
    case "registeredAt":
      return r.talent.registeredAt;
    case "kpiRate":
      return r.kpiRate;
    case "change":
      return r.change;
    case "streamMinutes":
      return r.streamMinutes;
    default:
      return r[key];
  }
}

export default function TalentRanking({
  rows,
  showApp = false,
  showFilters = false,
  showStreamTime = false,
  initialApp = "",
  initialFlag = "",
  periodQuery = "",
  compareLabel = "前月",
  pageSize = 50,
}: {
  rows: TalentRow[];
  showApp?: boolean;
  showFilters?: boolean;
  showStreamTime?: boolean;
  initialApp?: string;
  initialFlag?: string;
  periodQuery?: string;
  compareLabel?: string;
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [desc, setDesc] = useState(true);
  const [app, setApp] = useState(initialApp);
  const [status, setStatus] = useState("");
  const [flag, setFlag] = useState(initialFlag);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(pageSize);

  // 売上順位は並べ替えに関係なく固定
  const rankByKey = useMemo(() => {
    const map = new Map<string, number>();
    [...rows].sort((a, b) => b.revenue - a.revenue).forEach((r, i) => map.set(r.talent.key, i + 1));
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!app || r.talent.app === app) &&
        (!status || r.talent.status === status) &&
        (!flag || (flag === "any" ? r.flags.length > 0 : r.flags.includes(flag as TalentFlag))) &&
        (!keyword || r.talent.name.toLowerCase().includes(keyword) || r.talent.talentId.toLowerCase().includes(keyword))
    );
    return list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      // 値なしは常に末尾
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }, [rows, app, status, flag, q, sortKey, desc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "registeredAt");
    }
  };

  const Th = ({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-3 py-2 font-medium", className)}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-gray-900">
          {children}
          <span className="text-[10px]">{sortKey === k ? (desc ? "▼" : "▲") : "↕"}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="text-gray-500">並び替え</span>
          <select
            className="rounded-lg border border-gray-300 bg-white px-2 py-1"
            value={sortKey}
            onChange={(e) => {
              const k = e.target.value as SortKey;
              setSortKey(k);
              setDesc(k !== "registeredAt");
            }}
          >
            {(Object.keys(SORT_LABEL) as SortKey[])
              .filter((k) => showStreamTime || k !== "streamMinutes")
              .map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
          </select>
        </label>
        <button type="button" className="rounded-lg border border-gray-300 bg-white px-2 py-1" onClick={() => setDesc(!desc)}>
          {desc ? "降順" : "昇順"}
        </button>
        {showFilters && (
          <>
            <select className="rounded-lg border border-gray-300 bg-white px-2 py-1" value={app} onChange={(e) => setApp(e.target.value)} aria-label="アプリ">
              <option value="">すべてのアプリ</option>
              {APPS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <select className="rounded-lg border border-gray-300 bg-white px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="活動状況">
              <option value="">すべての活動状況</option>
              {TALENT_STATUSES.filter((s) => s !== "登録前").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}
        <select className="rounded-lg border border-gray-300 bg-white px-2 py-1" value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="要確認">
          <option value="">要確認：すべて</option>
          <option value="any">要確認のみ</option>
          {(Object.keys(TALENT_FLAG_LABEL) as TalentFlag[]).map((f) => (
            <option key={f} value={f}>
              {TALENT_FLAG_LABEL[f]}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="名前・IDで検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1"
        />
        <span className="text-xs text-gray-500">{filtered.length}名</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[960px] whitespace-nowrap text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-right font-medium">順位</th>
              <th className="px-3 py-2 font-medium">タレント</th>
              {showApp && <th className="px-3 py-2 font-medium">アプリ</th>}
              <Th k="registeredAt">登録日</Th>
              <th className="px-3 py-2 font-medium">活動状況</th>
              <Th k="revenue" className="text-right">当期収益</Th>
              <th className="px-3 py-2 text-right font-medium" title={compareLabel}>前月収益</th>
              <Th k="change" className="text-right">前月比</Th>
              <Th k="cumulativeRevenue" className="text-right">累計収益</Th>
              <Th k="streamDays" className="text-right">配信日数</Th>
              {showStreamTime && <Th k="streamMinutes" className="text-right">配信時間</Th>}
              <Th k="kpiRate" className="text-right">KPI達成率</Th>
              <th className="px-3 py-2 font-medium">要確認</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.talent.key} className="hover:bg-brand-50/40">
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.revenue > 0 ? rankByKey.get(r.talent.key) : "-"}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/talents/${encodeURIComponent(r.talent.app)}/${encodeURIComponent(r.talent.talentId)}${periodQuery}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {r.talent.name}
                  </Link>
                  <span className="ml-1 text-xs text-gray-400">{r.talent.talentId}</span>
                </td>
                {showApp && (
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: APPS.find((a) => a.id === r.talent.app)?.color }} />
                      {r.talent.app}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 tabular-nums text-gray-600">{formatDateJp(r.talent.registeredAt)}</td>
                <td className="px-3 py-2 text-gray-600">{r.talent.status}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{yen(r.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{yen(r.compareRevenue)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", trendClass(r.change))}>{signedPercent(r.change)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{yen(r.cumulativeRevenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.streamDays}日</td>
                {showStreamTime && <td className="px-3 py-2 text-right tabular-nums">{hoursMinutes(r.streamMinutes)}</td>}
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.kpiRate === null ? (
                    <span className="text-gray-400">-</span>
                  ) : (
                    <span className={r.kpiRate >= 100 ? "font-semibold text-emerald-700" : ""} title={`目標 ${yen(r.kpiTarget)}`}>
                      {percent(r.kpiRate, 0)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {r.flags.map((f) => (
                      <span key={f} className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                        {TALENT_FLAG_LABEL[f]}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-gray-400">
                  該当するタレントがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button type="button" className="text-sm text-brand-600 underline" onClick={() => setLimit(limit + pageSize)}>
          さらに表示（残り{filtered.length - limit}名）
        </button>
      )}
    </div>
  );
}
