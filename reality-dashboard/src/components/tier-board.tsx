"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveTalentAction, type SaveState } from "@/app/(dashboard)/actions";
import type { MonthView, TalentView } from "@/lib/reality/data";
import { TIERS, monthLabel, type Tier } from "@/lib/reality/tier";
import { cn } from "@/lib/utils";

export const TIER_STYLE: Record<Tier, { bar: string; chip: string; dot: string }> = {
  T1: { bar: "border-t-amber-400", chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-400" },
  T2: { bar: "border-t-emerald-500", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  T3: { bar: "border-t-sky-500", chip: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  T4: { bar: "border-t-violet-500", chip: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  T5: { bar: "border-t-gray-400", chip: "bg-gray-100 text-gray-700 ring-gray-200", dot: "bg-gray-400" },
  未評価: { bar: "border-t-gray-200", chip: "bg-white text-gray-500 ring-gray-200", dot: "bg-gray-200" },
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function TierChip({ tier }: { tier: Tier }) {
  return <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs font-bold ring-1", TIER_STYLE[tier].chip)}>{tier}</span>;
}

function ChangeChip({ t }: { t: TalentView }) {
  if (t.change === "新規") return <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-600">新規</span>;
  if (t.change === "昇格")
    return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">{t.prevTier}→</span>;
  if (t.change === "降格") return <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-600">{t.prevTier}→</span>;
  if (t.change === "維持") return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">維持</span>;
  return null;
}

function Delta({ n }: { n: number }) {
  if (n === 0) return <span className="text-gray-400">±0</span>;
  return <span className={n > 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{n > 0 ? `+${n}` : n}</span>;
}

export default function TierBoard({ view, spreadsheetUrl }: { view: MonthView; spreadsheetUrl: string }) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [change, setChange] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const c = view.criteria;
  const tab = view.tabs.find((t) => t.month === view.month);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return view.list.filter(
      (x) =>
        (!s || x.name.toLowerCase().includes(s) || x.id.toLowerCase().includes(s)) &&
        (!owner || (owner === "__none" ? !x.owner : x.owner === owner)) &&
        (!change || x.change === change)
    );
  }, [view.list, q, owner, change]);
  const open = openId ? view.list.find((x) => x.id === openId) ?? null : null;

  const moves = { 昇格: 0, 降格: 0, 新規: 0 };
  for (const x of view.list) if (x.change in moves) moves[x.change as keyof typeof moves]++;

  const desc: Record<Tier, string> = {
    T1: `月${c.hours}h・イベント${c.events}回＋3ヶ月平均${c.t1 / 10000}万円以上`,
    T2: `月${c.hours}h・イベント${c.events}回＋3ヶ月平均${c.t2 / 10000}万円以上`,
    T3: `デビュー3ヶ月以内に月${c.t3 / 10000}万円${c.rescue ? "（既存は直近3ヶ月）" : ""}`,
    T4: `初月${c.hours}h・イベント${c.events}回／${c.t3 / 10000}万円待ち`,
    T5: "上記以外",
    未評価: "評価月より後にデビュー",
  };

  return (
    <div className="space-y-4">
      {/* 月タブ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {view.tabs.map((t) => (
          <Link
            key={t.month}
            href={`/?m=${t.month}`}
            scroll={false}
            className={cn(
              "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm",
              t.month === view.month ? "border-gray-900 bg-gray-900 font-semibold text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"
            )}
          >
            {t.label}
            {t.partial && <span className={cn("ml-1 rounded px-1 text-[10px]", t.month === view.month ? "bg-white/20" : "bg-amber-50 text-amber-800")}>途中</span>}
          </Link>
        ))}
      </div>

      {/* 人数 */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:grid-cols-4 xl:grid-cols-7">
        {TIERS.map((t) => (
          <div key={t} className="border-b border-r border-gray-100 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <span className={cn("h-2.5 w-2.5 rounded-sm", TIER_STYLE[t].dot)} />
              {t}
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {view.counts[t]}
              <span className="ml-0.5 text-xs font-normal text-gray-500">人</span>
            </p>
            <p className="text-xs text-gray-500 tabular-nums">
              {view.hasPrev ? (
                <>
                  前月 {view.prevCounts[t]}人 <Delta n={view.counts[t] - view.prevCounts[t]} />
                </>
              ) : (
                "前月 —"
              )}
            </p>
          </div>
        ))}
        <div className="border-b border-r border-gray-100 px-4 py-3">
          <p className="text-xs font-semibold text-gray-700">在籍（合計）</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {view.list.length}
            <span className="ml-0.5 text-xs font-normal text-gray-500">人</span>
          </p>
          <p className="text-xs text-gray-500 tabular-nums">
            {view.hasPrev ? (
              <>
                前月 {view.prevTotal}人 <Delta n={view.list.length - view.prevTotal} />
              </>
            ) : (
              "前月 —"
            )}
          </p>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        <span>
          評価月 <b className="text-gray-900">{monthLabel(view.month)}</b>
          {tab?.through && <span className="ml-1 text-gray-500">（{tab.through}分まで）</span>}
          {tab?.partial && <span className="ml-1 text-amber-700">※途中経過の数値です</span>}
        </span>
        {view.hasPrev ? (
          <>
            <span>前月 {monthLabel(view.prevMonth)} から：</span>
            <span>昇格 <b className="text-gray-900">{moves["昇格"]}人</b></span>
            <span>降格 <b className="text-gray-900">{moves["降格"]}人</b></span>
            <span>新規 <b className="text-gray-900">{moves["新規"]}人</b></span>
          </>
        ) : (
          <span>前月のデータがないため比較なし</span>
        )}
      </p>

      {/* 絞り込み */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="配信者名・IDで探す"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 sm:w-64"
        />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5">
          <option value="">担当者：すべて</option>
          <option value="__none">担当者：未設定</option>
          {view.owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select value={change} onChange={(e) => setChange(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5">
          <option value="">変化：すべて</option>
          <option value="昇格">昇格</option>
          <option value="降格">降格</option>
          <option value="維持">維持</option>
          <option value="新規">新規</option>
        </select>
        <span className="flex-1" />
        <span className="text-xs text-gray-500">{list.length === view.list.length ? `${list.length}人` : `${list.length}人 / ${view.list.length}人`}</span>
        <a href={`/api/export?m=${view.month}`} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
          この月をCSV書き出し
        </a>
        {spreadsheetUrl && (
          <a href={spreadsheetUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
            スプレッドシートを開く
          </a>
        )}
      </div>

      {/* ティア別メンバー */}
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {TIERS.map((t) => {
          const people = list.filter((x) => x.tier === t);
          return (
            <section key={t} className={cn("overflow-hidden rounded-xl border border-t-4 border-gray-200 bg-white", TIER_STYLE[t].bar)}>
              <div className="flex items-baseline justify-between px-3 pt-2.5">
                <h2 className="text-lg font-bold">{t}</h2>
                <span className="text-sm tabular-nums text-gray-500">{people.length}人</span>
              </div>
              <p className="border-b border-gray-100 px-3 pb-2 text-[11px] leading-snug text-gray-500">{desc[t]}</p>
              {people.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400">該当者なし</p>
              ) : (
                <ol className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1">
                  {people.map((x, i) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(x.id)}
                        className="grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-md px-1.5 py-1.5 text-left hover:bg-gray-50"
                      >
                        <span className="text-right text-[11px] tabular-nums text-gray-400">{i + 1}</span>
                        <span className="truncate text-sm" title={x.name}>
                          {x.name}
                        </span>
                        <span className="row-span-2">
                          <ChangeChip t={x} />
                        </span>
                        <span className="col-start-2 text-[11px] tabular-nums text-gray-500">
                          {yen(x.sales)}
                          {x.owner && `・${x.owner}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        判定基準：月{c.hours}h・イベント{c.events}回＋3ヶ月平均 T1 {c.t1 / 10000}万／T2 {c.t2 / 10000}万、T3 月{c.t3 / 10000}万（救済
        {c.rescue ? "ON" : "OFF"}）。売上＝合計ギフト金額、会社売上はその{Math.round(c.rate * 100)}%。前月＝前月を評価月にしたときのティア。
      </p>

      {open && <TalentDrawer t={open} month={view.month} owners={view.owners} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm">
      {pending ? "保存中…" : "保存"}
    </button>
  );
}

function TalentDrawer({ t, month, owners, onClose }: { t: TalentView; month: number; owners: string[]; onClose: () => void }) {
  const [state, action] = useFormState<SaveState, FormData>(saveTalentAction, { ok: false, message: null });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kv: Array<[string, string]> = [
    ["評価月 配信時間", `${h1(t.hours)}h`],
    ["評価月 イベント数", `${t.events}回`],
    ["評価月 売上", yen(t.sales)],
    ["3ヶ月平均 売上", yen(t.avg3)],
    ["1ヶ月前 売上", yen(t.sales1)],
    ["2ヶ月前 売上", yen(t.sales2)],
    ["初配信日", t.debutDate || "不明"],
    ["経過月数", t.elapsed === null ? "—" : `${t.elapsed}ヶ月`],
    ["初月 配信時間・イベント", t.firstHours === null ? "—" : `${h1(t.firstHours)}h・${t.firstEvents}回`],
    ["デビュー3ヶ月内の最高月売上", t.debutMax === null ? "—" : yen(t.debutMax)],
    ["REALITYランク", t.rank || "—"],
    ["会社売上（評価月）", yen(t.company)],
  ];

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col bg-white shadow-2xl" aria-label="配信者の詳細">
        <div className="space-y-1.5 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="break-all text-lg font-bold">{t.name}</h2>
            <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-2.5 py-1 text-lg leading-none" aria-label="閉じる">
              ×
            </button>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <TierChip tier={t.tier} />
            {monthLabel(month)}評価
            {t.prevTier && `・前月 ${t.prevTier}`}
            {t.change && t.change !== "—" && `（${t.change}）`}
            <span className="break-all">ID {t.id}</span>
          </p>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="space-y-1 rounded-lg bg-gray-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-gray-500">判定理由</p>
            <p>{t.reason}</p>
            <p className="pt-1 text-xs font-semibold text-gray-500">次の目標</p>
            <p>{t.next}</p>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
            {kv.map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2">
                <dt className="text-[11px] text-gray-500">{k}</dt>
                <dd className="text-sm tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">月ごとのティア</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="py-1.5 text-left font-medium">月</th>
                    <th className="py-1.5 text-left font-medium">ティア</th>
                    <th className="py-1.5 text-right font-medium">配信時間</th>
                    <th className="py-1.5 text-right font-medium">イベント</th>
                    <th className="py-1.5 text-right font-medium">売上</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {t.history.map((h) => (
                    <tr key={h.month} className={h.month === month ? "bg-brand-50" : ""}>
                      <td className="py-1.5">{monthLabel(h.month)}</td>
                      <td className="py-1.5">
                        <TierChip tier={h.tier} />
                      </td>
                      <td className="py-1.5 text-right">{h1(h.hours)}h</td>
                      <td className="py-1.5 text-right">{h.events}回</td>
                      <td className="py-1.5 text-right">{yen(h.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <form action={action} className="space-y-3" key={t.id}>
            <p className="text-xs font-semibold text-gray-500">担当者・メモ（スプレッドシートのタレントマスタに保存）</p>
            <input type="hidden" name="id" value={t.id} />
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-gray-500">担当者</span>
              <input name="owner" list="owner-list" defaultValue={t.owner} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="例：井上" />
              <datalist id="owner-list">
                {owners.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-gray-500">メモ</span>
              <textarea name="memo" defaultValue={t.memo} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <div className="flex items-center justify-end gap-3">
              {state.message && <span className={cn("text-xs", state.ok ? "text-emerald-700" : "text-red-600")}>{state.message}</span>}
              <SaveButton />
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}
