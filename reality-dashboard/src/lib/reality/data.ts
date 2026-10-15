import { callGas, readGasConfig, type GasConfig, type RealityData, type UploadFile } from "./gas";
import {
  DEFAULT_CRITERIA,
  TIERS,
  addMonths,
  buildIndex,
  defaultMonth,
  judge,
  judgeMonth,
  monthLabel,
  tierChange,
  tierRank,
  type Change,
  type Criteria,
  type Judgement,
  type Tier,
} from "./tier";

export interface HistoryPoint {
  month: number;
  tier: Tier;
  hours: number;
  events: number;
  sales: number;
}

export interface TalentView extends Judgement {
  prevTier: string;
  change: Change;
  owner: string;
  memo: string;
  history: HistoryPoint[];
}

export interface MonthTab {
  month: number;
  label: string;
  /** 今月以降（途中経過） */
  partial: boolean;
  /** 何日分まで取り込んだか */
  through: string;
}

export interface MonthView {
  tabs: MonthTab[];
  month: number;
  prevMonth: number;
  hasPrev: boolean;
  list: TalentView[];
  counts: Record<Tier, number>;
  prevCounts: Record<Tier, number>;
  prevTotal: number;
  owners: string[];
  criteria: Criteria;
}

// ---- 読み込み（短いキャッシュ付き） ----

const TTL_MS = 30_000;
let cache: { at: number; data: RealityData } | null = null;

export function invalidateRealityCache() {
  cache = null;
}

export type LoadResult =
  | { status: "ok"; data: RealityData }
  | { status: "not_configured" }
  | { status: "error"; message: string };

export function gasConfig(): { config: GasConfig | null; error: string | null } {
  try {
    return { config: readGasConfig(), error: null };
  } catch (e) {
    return { config: null, error: (e as Error).message };
  }
}

export async function loadReality(opts: { fresh?: boolean } = {}): Promise<LoadResult> {
  const { config, error } = gasConfig();
  if (error) return { status: "error", message: error };
  if (!config) return { status: "not_configured" };
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return { status: "ok", data: cache.data };
  try {
    const data = await callGas<RealityData>(config, "load");
    data.criteria = { ...DEFAULT_CRITERIA, ...data.criteria };
    cache = { at: Date.now(), data };
    return { status: "ok", data };
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
}

export async function writeReality<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { config, error } = gasConfig();
  if (error) throw new Error(error);
  if (!config) throw new Error("スプレッドシートに接続されていません（GAS_WEBAPP_URL・GAS_TOKEN を設定してください）");
  try {
    return await callGas<T>(config, action, payload);
  } finally {
    invalidateRealityCache();
  }
}

export const importFiles = (files: UploadFile[]) => writeReality<{ messages: string[] }>("import", { files });

// ---- 画面用のデータ ----

const zeroCounts = () => Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;

export function buildMonthView(data: RealityData, requested: number | null, now = new Date()): MonthView | null {
  const idx = buildIndex(data.months);
  const c = data.criteria;
  if (!idx.months.length) return null;
  const month = requested && idx.months.includes(requested) ? requested : (defaultMonth(idx.months, c, now) as number);
  const prevMonth = addMonths(month, -1);
  const hasPrev = !!idx.idsByMonth[prevMonth];
  const prevMap = new Map<string, Tier>();
  if (hasPrev) for (const j of judgeMonth(idx, prevMonth, c)) prevMap.set(j.id, j.tier);

  const talents = new Map(data.talents.map(([id, , owner, memo]) => [id, { owner, memo }]));
  const list: TalentView[] = judgeMonth(idx, month, c).map((j) => {
    const prevTier = prevMap.get(j.id) ?? "";
    return {
      ...j,
      prevTier,
      change: hasPrev ? tierChange(prevTier, j.tier) : "",
      owner: talents.get(j.id)?.owner ?? "",
      memo: talents.get(j.id)?.memo ?? "",
      history: idx.months
        .filter((m) => idx.idsByMonth[m].includes(j.id))
        .reverse()
        .map((m) => {
          const h = m === month ? j : judge(idx, j.id, m, c);
          return { month: m, tier: h.tier, hours: h.hours, events: h.events, sales: h.sales };
        }),
    };
  });
  list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.sales - a.sales);

  const counts = zeroCounts();
  for (const t of list) counts[t.tier]++;
  const prevCounts = zeroCounts();
  prevMap.forEach((t) => prevCounts[t]++);

  const thisMonth = now.getFullYear() * 100 + now.getMonth() + 1;
  const tabs = idx.months
    .slice()
    .reverse()
    .map((m) => ({ month: m, label: monthLabel(m), partial: m >= thisMonth, through: data.periods[String(m)] ?? "" }));
  const owners = Array.from(new Set(data.talents.map((t) => t[2]).filter(Boolean))).sort();

  return { tabs, month, prevMonth, hasPrev, list, counts, prevCounts, prevTotal: prevMap.size, owners, criteria: c };
}

/** 月の一覧をCSVにする（書き出し用） */
export function monthCsv(view: MonthView): string {
  const head = [
    "ID", "配信者名", "担当者", "ティア", "前月ティア", "変化", "REALITYランク", "初配信日", "経過月数", "配信時間（h）", "イベント数",
    "売上（円）", "1ヶ月前 売上（円）", "2ヶ月前 売上（円）", "3ヶ月平均 売上（円）", "基本条件", "初月 配信時間（h）", "初月 イベント数",
    "デビュー3ヶ月内の最高月売上", "直近3ヶ月の最高月売上", "判定理由", "次のティアまで", "会社売上（円）", "メモ",
  ];
  const q = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const r1 = (n: number | null) => (n === null ? "" : Math.round(n * 10) / 10);
  const r0 = (n: number | null) => (n === null ? "" : Math.round(n));
  const lines = view.list.map((x) =>
    [
      x.id, x.name, x.owner, x.tier, x.prevTier, x.change, x.rank, x.debutDate, x.elapsed ?? "", r1(x.hours), x.events,
      r0(x.sales), r0(x.sales1), r0(x.sales2), r0(x.avg3), x.basic ? "◯" : "✕", r1(x.firstHours), x.firstEvents ?? "",
      r0(x.debutMax), r0(x.recentMax), x.reason, x.next, r0(x.company), x.memo,
    ]
      .map(q)
      .join(",")
  );
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}
