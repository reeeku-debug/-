// 共通フォーマットのデータから画面用の集計値（ANALYTICS DATA）を作る。
// ここは CSV の形式に一切依存しない。

import { APPS, ALL_APPS_ID } from "./apps";
import { evaluateScopeKpis, talentRevenueTarget, type ActualValues, type KpiEvaluation } from "./kpi";
import { addMonths, diffDays, monthEnd, monthOf, monthStart, monthsBetween } from "./parse";
import type { Period } from "./period";
import type { RevenueModel, RevenueRecord, Talent, TalentFlag } from "./types";

const INACTIVE_STATUSES = new Set(["登録前", "休止", "卒業"]);

export interface TalentAgg {
  revenue: number;
  streamDays: number;
  revenueDays: number;
  streamMinutes: number | null;
  streamCount: number | null;
  firstRevenueDate: string | null;
  lastActiveDate: string | null;
}

function emptyAgg(): TalentAgg {
  return {
    revenue: 0,
    streamDays: 0,
    revenueDays: 0,
    streamMinutes: null,
    streamCount: null,
    firstRevenueDate: null,
    lastActiveDate: null,
  };
}

export function isStreamDay(r: RevenueRecord): boolean {
  return r.revenue > 0 || (r.streamMinutes ?? 0) > 0 || (r.streamCount ?? 0) > 0;
}

/** 期間内のレコードをタレント別に集計（配信日数は日付の重複を除いて数える） */
export function aggregateByTalent(records: RevenueRecord[], start: string, end: string): Map<string, TalentAgg> {
  const map = new Map<string, TalentAgg>();
  const days = new Map<string, Set<string>>();
  const revenueDays = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.date < start || r.date > end) continue;
    const key = `${r.app}:${r.talentId}`;
    let agg = map.get(key);
    if (!agg) {
      agg = emptyAgg();
      map.set(key, agg);
    }
    agg.revenue += r.revenue;
    if (r.streamMinutes !== null) agg.streamMinutes = (agg.streamMinutes ?? 0) + r.streamMinutes;
    if (r.streamCount !== null) agg.streamCount = (agg.streamCount ?? 0) + r.streamCount;
    if (isStreamDay(r)) {
      let set = days.get(key);
      if (!set) days.set(key, (set = new Set()));
      set.add(r.date);
      if (!agg.lastActiveDate || r.date > agg.lastActiveDate) agg.lastActiveDate = r.date;
    }
    let rd = revenueDays.get(key);
    if (!rd) revenueDays.set(key, (rd = new Map()));
    rd.set(r.date, (rd.get(r.date) ?? 0) + r.revenue);
  }
  map.forEach((agg, key) => {
    agg.streamDays = days.get(key)?.size ?? 0;
    const rd = revenueDays.get(key);
    if (rd) {
      rd.forEach((v, date) => {
        if (v > 0) {
          agg.revenueDays++;
          if (!agg.firstRevenueDate || date < agg.firstRevenueDate) agg.firstRevenueDate = date;
        }
      });
    }
  });
  return map;
}

export function isRegisteredBy(t: Talent, date: string): boolean {
  if (t.status === "登録前") return false;
  if (!t.registeredAt) return true; // 登録日不明（RAWのみ）のタレントは登録済扱い
  return t.registeredAt <= date;
}

function inRange(date: string | null, start: string, end: string): boolean {
  return !!date && date >= start && date <= end;
}

function sumRevenue(records: RevenueRecord[], start: string, end: string, app?: string): number {
  let total = 0;
  for (const r of records) {
    if (r.date < start || r.date > end) continue;
    if (app && r.app !== app) continue;
    total += r.revenue;
  }
  return total;
}

export function changeRate(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// ---------------------------------------------------------------
// スコープ（全体 / アプリ）別の指標
// ---------------------------------------------------------------

export interface ScopeMetrics {
  scope: string;
  revenue: number;
  compareRevenue: number;
  /** 前月（比較期間）全体の売上（進行中の月でも前月1か月分） */
  previousFullRevenue: number;
  revenueChange: number | null;
  cumulativeRevenue: number;
  newRegistrations: number;
  compareNewRegistrations: number;
  registrationChange: number | null;
  registrationDiff: number;
  totalRegistrations: number;
  /** 配信収益 ÷ 累計登録者数 */
  revenuePerRegistered: number | null;
  /** ステータスが「配信開始」の登録済タレント数 */
  streamingTalents: number;
  /** 期間内に配信（または売上発生）したタレント数 */
  streamers: number;
  /** 期間内に売上が発生したタレント数 */
  earners: number;
  /** 活動開始日が期間内のタレント数 */
  activations: number;
}

export function scopeMetrics(model: RevenueModel, period: Period, scope: string): ScopeMetrics {
  const app = scope === ALL_APPS_ID ? undefined : scope;
  const talents = model.talents.filter((t) => !app || t.app === app);
  const records = app ? model.records.filter((r) => r.app === app) : model.records;
  const end = period.dataEnd;

  const revenue = sumRevenue(records, period.start, end);
  const compareRevenue = sumRevenue(records, period.compareStart, period.compareEnd);
  const prevMonth = addMonths(monthOf(period.start), -1);
  const previousFullRevenue = period.month
    ? sumRevenue(records, monthStart(prevMonth), monthEnd(prevMonth))
    : compareRevenue;

  const registered = talents.filter((t) => isRegisteredBy(t, end));
  const newRegistrations = talents.filter(
    (t) => t.status !== "登録前" && inRange(t.registeredAt, period.start, end)
  ).length;
  const compareNewRegistrations = talents.filter(
    (t) => t.status !== "登録前" && inRange(t.registeredAt, period.compareStart, period.compareEnd)
  ).length;

  const agg = aggregateByTalent(records, period.start, end);
  let streamers = 0;
  let earners = 0;
  agg.forEach((a) => {
    if (a.streamDays > 0) streamers++;
    if (a.revenue > 0) earners++;
  });

  return {
    scope,
    revenue,
    compareRevenue,
    previousFullRevenue,
    revenueChange: changeRate(revenue, compareRevenue),
    cumulativeRevenue: sumRevenue(records, "0000-00-00", end),
    newRegistrations,
    compareNewRegistrations,
    registrationChange: changeRate(newRegistrations, compareNewRegistrations),
    registrationDiff: newRegistrations - compareNewRegistrations,
    totalRegistrations: registered.length,
    revenuePerRegistered: registered.length > 0 ? revenue / registered.length : null,
    streamingTalents: registered.filter((t) => t.status === "配信開始").length,
    streamers,
    earners,
    activations: talents.filter((t) => inRange(t.activityStartAt, period.start, end)).length,
  };
}

export function metricsToActuals(m: ScopeMetrics): ActualValues {
  return {
    revenue: m.revenue,
    new_registrations: m.newRegistrations,
    activations: m.activations,
    streamers: m.streamers,
    earners: m.earners,
  };
}

export function scopeKpis(model: RevenueModel, period: Period, metrics: ScopeMetrics): KpiEvaluation[] {
  return evaluateScopeKpis(model.kpis, period, metrics.scope, metricsToActuals(metrics), model.settings);
}

// ---------------------------------------------------------------
// タレント別
// ---------------------------------------------------------------

export type { TalentFlag } from "./types";
export { TALENT_FLAG_LABEL } from "./types";

export interface TalentRow {
  talent: Talent;
  revenue: number;
  compareRevenue: number;
  cumulativeRevenue: number;
  change: number | null;
  streamDays: number;
  streamMinutes: number | null;
  streamCount: number | null;
  revenuePerStreamDay: number | null;
  revenuePerHour: number | null;
  /** スコープ売上に占める割合（%） */
  share: number;
  kpiTarget: number | null;
  kpiRate: number | null;
  /** 進行中の月の着地見込みベースの達成率 */
  kpiForecastRate: number | null;
  daysSinceRegistration: number | null;
  firstRevenueDate: string | null;
  lastActiveDate: string | null;
  flags: TalentFlag[];
}

export function talentRows(model: RevenueModel, period: Period, scope: string = ALL_APPS_ID): TalentRow[] {
  const app = scope === ALL_APPS_ID ? undefined : scope;
  const talents = model.talents.filter((t) => (!app || t.app === app) && isRegisteredBy(t, period.dataEnd));
  const records = app ? model.records.filter((r) => r.app === app) : model.records;
  const current = aggregateByTalent(records, period.start, period.dataEnd);
  const compare = aggregateByTalent(records, period.compareStart, period.compareEnd);
  const lifetime = aggregateByTalent(records, "0000-00-00", period.dataEnd);
  const total = sumRevenue(records, period.start, period.dataEnd);
  const s = model.settings;

  return talents.map((t) => {
    const cur = current.get(t.key) ?? emptyAgg();
    const cmp = compare.get(t.key) ?? emptyAgg();
    const life = lifetime.get(t.key) ?? emptyAgg();
    const kpiTarget = talentRevenueTarget(model.kpis, period, t);
    const kpiRate = kpiTarget && kpiTarget > 0 ? (cur.revenue / kpiTarget) * 100 : null;
    const kpiForecastRate =
      kpiRate !== null && period.inProgress && period.elapsedDays > 0
        ? (kpiRate / period.elapsedDays) * period.totalDays
        : kpiRate;
    const daysSinceRegistration = t.registeredAt ? diffDays(t.registeredAt, period.dataEnd) : null;
    const change = changeRate(cur.revenue, cmp.revenue);
    const active = !INACTIVE_STATUSES.has(t.status);

    const flags: TalentFlag[] = [];
    if (active && daysSinceRegistration !== null && daysSinceRegistration >= s.noRevenueDays && life.revenue === 0) {
      flags.push("no_revenue");
    }
    if (
      active &&
      !flags.includes("no_revenue") &&
      cur.streamDays === 0 &&
      (daysSinceRegistration === null || daysSinceRegistration >= s.noRevenueDays)
    ) {
      flags.push("not_streaming");
    }
    if (cur.streamDays >= s.lowRevenueMinStreamDays && cur.revenue / cur.streamDays < s.lowRevenuePerDay) {
      flags.push("low_revenue");
    }
    if (cmp.revenue > 0 && change !== null && change <= -s.revenueDropRate) flags.push("revenue_drop");
    if (active && kpiForecastRate !== null && kpiForecastRate < s.kpiLowRate) flags.push("kpi_low");

    return {
      talent: t,
      revenue: cur.revenue,
      compareRevenue: cmp.revenue,
      cumulativeRevenue: life.revenue,
      change,
      streamDays: cur.streamDays,
      streamMinutes: cur.streamMinutes,
      streamCount: cur.streamCount,
      revenuePerStreamDay: cur.streamDays > 0 ? cur.revenue / cur.streamDays : null,
      revenuePerHour: cur.streamMinutes && cur.streamMinutes > 0 ? cur.revenue / (cur.streamMinutes / 60) : null,
      share: total > 0 ? (cur.revenue / total) * 100 : 0,
      kpiTarget,
      kpiRate,
      kpiForecastRate,
      daysSinceRegistration,
      firstRevenueDate: life.firstRevenueDate,
      lastActiveDate: life.lastActiveDate,
      flags,
    };
  });
}

// ---------------------------------------------------------------
// 売上依存度
// ---------------------------------------------------------------

export interface Concentration {
  total: number;
  top1: number;
  top3: number;
  top10: number;
  /** 売上上位（割合付き） */
  leaders: Array<{ talent: Talent; revenue: number; share: number; cumulativeShare: number }>;
}

export function concentration(rows: TalentRow[], limit = 10): Concentration {
  const sorted = rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, r) => s + r.revenue, 0);
  const shareOf = (n: number) =>
    total > 0 ? (sorted.slice(0, n).reduce((s, r) => s + r.revenue, 0) / total) * 100 : 0;
  let cum = 0;
  return {
    total,
    top1: shareOf(1),
    top3: shareOf(3),
    top10: shareOf(10),
    leaders: sorted.slice(0, limit).map((r) => {
      const share = total > 0 ? (r.revenue / total) * 100 : 0;
      cum += share;
      return { talent: r.talent, revenue: r.revenue, share, cumulativeShare: cum };
    }),
  };
}

// ---------------------------------------------------------------
// 月別推移
// ---------------------------------------------------------------

export interface MonthlyPoint {
  month: string;
  /** その月の集計対象が今日までの途中データか */
  partial: boolean;
  revenue: Record<string, number>;
  newRegistrations: Record<string, number>;
  totalRegistrations: Record<string, number>;
  revenuePerRegistered: Record<string, number | null>;
}

export function monthlySeries(model: RevenueModel, endMonth: string, months = 12): MonthlyPoint[] {
  const list = monthsBetween(addMonths(endMonth, -(months - 1)), endMonth);
  const revenueByMonthApp = new Map<string, number>();
  for (const r of model.records) {
    const k = `${monthOf(r.date)}|${r.app}`;
    revenueByMonthApp.set(k, (revenueByMonthApp.get(k) ?? 0) + r.revenue);
  }
  return list.map((month) => {
    const end = monthEnd(month) < model.today ? monthEnd(month) : model.today;
    const point: MonthlyPoint = {
      month,
      partial: model.today < monthEnd(month),
      revenue: {},
      newRegistrations: {},
      totalRegistrations: {},
      revenuePerRegistered: {},
    };
    for (const app of APPS) {
      const talents = model.talents.filter((t) => t.app === app.id);
      const revenue = revenueByMonthApp.get(`${month}|${app.id}`) ?? 0;
      const registered = talents.filter((t) => isRegisteredBy(t, end)).length;
      point.revenue[app.id] = revenue;
      point.newRegistrations[app.id] = talents.filter(
        (t) => t.status !== "登録前" && inRange(t.registeredAt, monthStart(month), end)
      ).length;
      point.totalRegistrations[app.id] = registered;
      point.revenuePerRegistered[app.id] = registered > 0 ? revenue / registered : null;
    }
    return point;
  });
}

/** タレント1人の月別売上 */
export function talentMonthly(model: RevenueModel, talent: Talent, endMonth: string, months = 12) {
  const list = monthsBetween(addMonths(endMonth, -(months - 1)), endMonth);
  const map = new Map<string, number>();
  for (const r of model.records) {
    if (r.app !== talent.app || r.talentId !== talent.talentId) continue;
    const m = monthOf(r.date);
    map.set(m, (map.get(m) ?? 0) + r.revenue);
  }
  return list.map((month) => ({ month, revenue: map.get(month) ?? 0 }));
}

/** タレント1人の日別レコード（期間内） */
export function talentDaily(model: RevenueModel, talent: Talent, start: string, end: string) {
  const byDate = new Map<string, RevenueRecord[]>();
  for (const r of model.records) {
    if (r.app !== talent.app || r.talentId !== talent.talentId || r.date < start || r.date > end) continue;
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, recs]) => ({
      date,
      revenue: recs.reduce((s, r) => s + r.revenue, 0),
      streamMinutes: recs.some((r) => r.streamMinutes !== null)
        ? recs.reduce((s, r) => s + (r.streamMinutes ?? 0), 0)
        : null,
      streamCount: recs.some((r) => r.streamCount !== null)
        ? recs.reduce((s, r) => s + (r.streamCount ?? 0), 0)
        : null,
    }));
}

/** 画面で配信時間・配信回数の列を表示するかどうか */
export function streamDataAvailability(model: RevenueModel, app?: string) {
  let minutes = false;
  let count = false;
  for (const r of model.records) {
    if (app && r.app !== app) continue;
    if (r.streamMinutes !== null) minutes = true;
    if (r.streamCount !== null) count = true;
    if (minutes && count) break;
  }
  return { minutes, count };
}
