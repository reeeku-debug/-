// KPI の目標値解決と達成率・不足分の計算

import { APPS, ALL_APPS_ID } from "./apps";
import { KPI_DEFINITIONS, kpiDefinitionByKey, type KpiUnit } from "./kpi-definitions";
import { diffDays, monthEnd, monthStart, monthsBetween, monthOf } from "./parse";
import type { Period } from "./period";
import type { KpiTarget, RevenueSettings, Talent } from "./types";

/** KPI項目キー → 実績値 */
export type ActualValues = Partial<Record<string, number>>;

export type KpiStatus = "achieved" | "on_track" | "attention" | "critical" | "no_target";

export interface KpiEvaluation {
  scope: string; // アプリID or 全体
  item: string;
  label: string;
  unit: KpiUnit;
  target: number | null;
  /** 目標が「アプリ別目標の合計」から算出されたか */
  targetDerived: boolean;
  actual: number | null;
  rate: number | null;
  /** 進行中の月の月末着地見込み（加算型の指標のみ） */
  forecast: number | null;
  forecastRate: number | null;
  shortfall: number | null;
  /** 残り日数で目標に届くために必要な1日あたりの実績 */
  requiredPerDay: number | null;
  remainingDays: number;
  status: KpiStatus;
}

const ADDITIVE_ITEMS = new Set(["revenue", "new_registrations", "activations"]);

/**
 * 期間に対する目標値。1か月ちょうどの期間ならその月の目標、
 * 任意期間なら各月の目標を日数で按分して合算する。
 */
export function targetForPeriod(period: Period, lookup: (month: string) => number | null): number | null {
  if (period.month) return lookup(period.month);
  let total = 0;
  let found = false;
  for (const month of monthsBetween(monthOf(period.start), monthOf(period.end))) {
    const t = lookup(month);
    if (t === null) continue;
    found = true;
    const ms = monthStart(month) > period.start ? monthStart(month) : period.start;
    const me = monthEnd(month) < period.end ? monthEnd(month) : period.end;
    const overlap = diffDays(ms, me) + 1;
    const days = diffDays(monthStart(month), monthEnd(month)) + 1;
    total += (t * overlap) / days;
  }
  return found ? Math.round(total) : null;
}

function findTarget(kpis: KpiTarget[], month: string, app: string, item: string, talentId: string | null = null) {
  return kpis.find((k) => k.month === month && k.app === app && k.item === item && k.talentId === talentId);
}

/** スコープ（アプリ or 全体）の目標値。全体が未設定ならアプリ別目標の合計を使う */
export function scopeTarget(kpis: KpiTarget[], period: Period, scope: string, item: string) {
  let derived = false;
  const target = targetForPeriod(period, (month) => {
    const direct = findTarget(kpis, month, scope, item);
    if (direct) return direct.target;
    if (scope !== ALL_APPS_ID) return null;
    const parts = APPS.map((a) => findTarget(kpis, month, a.id, item)).filter((k): k is KpiTarget => !!k);
    if (parts.length === 0) return null;
    derived = true;
    return parts.reduce((s, k) => s + k.target, 0);
  });
  return { target, derived };
}

/** タレントの売上目標（個別設定 → アプリ単位のタレント売上目標 → 全体の順に参照） */
export function talentRevenueTarget(kpis: KpiTarget[], period: Period, talent: Talent): number | null {
  return targetForPeriod(period, (month) => {
    const own = findTarget(kpis, month, talent.app, "talent_revenue", talent.talentId);
    if (own) return own.target;
    const allOwn = findTarget(kpis, month, ALL_APPS_ID, "talent_revenue", talent.talentId);
    if (allOwn) return allOwn.target;
    const appDefault = findTarget(kpis, month, talent.app, "talent_revenue");
    if (appDefault) return appDefault.target;
    return findTarget(kpis, month, ALL_APPS_ID, "talent_revenue")?.target ?? null;
  });
}

export function evaluateKpi(
  scope: string,
  item: string,
  label: string,
  unit: KpiUnit,
  target: number | null,
  targetDerived: boolean,
  actual: number | null,
  period: Period,
  settings: RevenueSettings
): KpiEvaluation {
  const remainingDays = period.inProgress ? Math.max(0, period.totalDays - period.elapsedDays) : 0;
  const base: KpiEvaluation = {
    scope,
    item,
    label,
    unit,
    target,
    targetDerived,
    actual,
    rate: null,
    forecast: null,
    forecastRate: null,
    shortfall: null,
    requiredPerDay: null,
    remainingDays,
    status: "no_target",
  };
  if (target === null || actual === null) return base;

  base.rate = target > 0 ? (actual / target) * 100 : actual > 0 ? 100 : 0;
  base.shortfall = Math.max(0, target - actual);
  if (period.inProgress && ADDITIVE_ITEMS.has(item) && period.elapsedDays > 0) {
    base.forecast = (actual / period.elapsedDays) * period.totalDays;
    base.forecastRate = target > 0 ? (base.forecast / target) * 100 : null;
    if (remainingDays > 0 && base.shortfall > 0) base.requiredPerDay = base.shortfall / remainingDays;
  }

  const judged = base.forecastRate ?? base.rate;
  if (base.rate >= 100) base.status = "achieved";
  else if (period.inProgress && base.forecastRate !== null && base.forecastRate >= 100) base.status = "on_track";
  else if (judged < settings.kpiLowRate) base.status = "critical";
  else base.status = "attention";
  return base;
}

/** スコープのKPIをすべて評価する（定義済み項目 + KPIシートにだけある独自項目） */
export function evaluateScopeKpis(
  kpis: KpiTarget[],
  period: Period,
  scope: string,
  actuals: ActualValues,
  settings: RevenueSettings
): KpiEvaluation[] {
  const results: KpiEvaluation[] = [];
  for (const def of KPI_DEFINITIONS) {
    if (def.perTalent) continue;
    const { target, derived } = scopeTarget(kpis, period, scope, def.key);
    results.push(
      evaluateKpi(scope, def.key, def.label, def.unit, target, derived, actuals[def.key] ?? null, period, settings)
    );
  }
  const customItems = new Map<string, string>();
  for (const k of kpis) {
    if (k.item.startsWith("custom:") && k.app === scope && !k.talentId) customItems.set(k.item, k.itemLabel);
  }
  customItems.forEach((label, item) => {
    const { target } = scopeTarget(kpis, period, scope, item);
    results.push(evaluateKpi(scope, item, label, "person", target, false, null, period, settings));
  });
  return results;
}

export const KPI_STATUS_LABEL: Record<KpiStatus, string> = {
  achieved: "達成",
  on_track: "順調",
  attention: "要確認",
  critical: "要対応",
  no_target: "目標未設定",
};

export function kpiUnit(item: string): KpiUnit {
  return kpiDefinitionByKey(item)?.unit ?? "person";
}
