// 要確認事項（アラート）の自動検出

import { APPS, ALL_APPS_ID, findApp } from "./apps";
import type { Concentration, ScopeMetrics, TalentFlag, TalentRow } from "./analytics";
import type { KpiEvaluation } from "./kpi";
import type { RevenueSettings } from "./types";

export type AlertSeverity = "critical" | "warning" | "info";

export interface RevenueAlert {
  severity: AlertSeverity;
  category: "kpi" | "revenue" | "registration" | "talent" | "concentration";
  scope: string;
  message: string;
  /** 詳細へのリンク（期間クエリは画面側で付与） */
  href?: string;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const pct = (n: number) => `${Math.abs(n).toFixed(0)}%`;

function scopeName(scope: string): string {
  return scope === ALL_APPS_ID ? "全体" : findApp(scope)?.label ?? scope;
}

function appHref(scope: string): string {
  return scope === ALL_APPS_ID ? "/" : `/app/${encodeURIComponent(scope)}`;
}

export function kpiAlerts(evaluations: KpiEvaluation[]): RevenueAlert[] {
  const alerts: RevenueAlert[] = [];
  for (const e of evaluations) {
    if (e.status !== "critical" && e.status !== "attention") continue;
    if (e.target === null || e.actual === null) continue;
    const fmt = e.unit === "yen" ? yen : (n: number) => `${Math.round(n)}人`;
    const basis =
      e.forecastRate !== null
        ? `着地見込み${e.forecastRate.toFixed(0)}%（現在${(e.rate ?? 0).toFixed(0)}%）`
        : `達成率${(e.rate ?? 0).toFixed(0)}%`;
    const perDay =
      e.requiredPerDay !== null && e.remainingDays > 0
        ? `／残り${e.remainingDays}日で1日あたり${fmt(e.requiredPerDay)}必要`
        : "";
    alerts.push({
      severity: e.status === "critical" ? "critical" : "warning",
      category: "kpi",
      scope: e.scope,
      message: `${scopeName(e.scope)}の${e.label}KPIが目標比${fmt(e.shortfall ?? 0)}不足（${basis}）${perDay}`,
      href: "/kpi",
    });
  }
  return alerts;
}

export function scopeAlerts(metrics: ScopeMetrics, settings: RevenueSettings): RevenueAlert[] {
  const alerts: RevenueAlert[] = [];
  const name = scopeName(metrics.scope);
  if (metrics.compareRevenue > 0 && metrics.revenueChange !== null && metrics.revenueChange <= -settings.revenueDropRate) {
    alerts.push({
      severity: "warning",
      category: "revenue",
      scope: metrics.scope,
      message: `${name}の売上が前月比${pct(metrics.revenueChange)}減少（${yen(metrics.compareRevenue)} → ${yen(metrics.revenue)}）`,
      href: appHref(metrics.scope),
    });
  }
  if (
    metrics.compareNewRegistrations > 0 &&
    metrics.registrationChange !== null &&
    metrics.registrationChange <= -settings.registrationDropRate
  ) {
    alerts.push({
      severity: "warning",
      category: "registration",
      scope: metrics.scope,
      message: `${name}の新規登録が前月比${pct(metrics.registrationChange)}減少（${metrics.compareNewRegistrations}人 → ${metrics.newRegistrations}人）`,
      href: appHref(metrics.scope),
    });
  }
  return alerts;
}

const FLAG_MESSAGES: Record<TalentFlag, (s: RevenueSettings) => string> = {
  no_revenue: (s) => `登録後${s.noRevenueDays}日以上経過しているが売上が発生していないタレント`,
  not_streaming: () => "登録済みだが期間内に配信していないタレント",
  low_revenue: (s) =>
    `${s.lowRevenueMinStreamDays}日以上配信しているが1配信日あたり売上が${yen(s.lowRevenuePerDay)}未満のタレント`,
  revenue_drop: (s) => `売上が前月比${s.revenueDropRate}%以上減少したタレント`,
  kpi_low: (s) => `個人売上KPIの達成見込みが${s.kpiLowRate}%未満のタレント`,
};

const FLAG_SEVERITY: Record<TalentFlag, AlertSeverity> = {
  no_revenue: "warning",
  not_streaming: "info",
  low_revenue: "info",
  revenue_drop: "warning",
  kpi_low: "info",
};

/** タレント単位の要確認をアプリごとに人数でまとめる */
export function talentAlerts(rows: TalentRow[], settings: RevenueSettings): RevenueAlert[] {
  const alerts: RevenueAlert[] = [];
  for (const app of APPS) {
    const appRows = rows.filter((r) => r.talent.app === app.id);
    for (const flag of Object.keys(FLAG_MESSAGES) as TalentFlag[]) {
      const hits = appRows.filter((r) => r.flags.includes(flag));
      if (hits.length === 0) continue;
      const names = hits
        .slice(0, 3)
        .map((r) => r.talent.name)
        .join("、");
      alerts.push({
        severity: FLAG_SEVERITY[flag],
        category: "talent",
        scope: app.id,
        message: `${app.label}で${FLAG_MESSAGES[flag](settings)}が${hits.length}名（${names}${hits.length > 3 ? " ほか" : ""}）`,
        href: `/talents?app=${encodeURIComponent(app.id)}&flag=${flag}`,
      });
    }
  }
  return alerts;
}

export function concentrationAlerts(scope: string, c: Concentration, settings: RevenueSettings): RevenueAlert[] {
  if (c.total <= 0) return [];
  const name = scopeName(scope);
  const top = c.leaders[0];
  if (c.top1 >= settings.concentrationTop1 && top) {
    return [
      {
        severity: "warning",
        category: "concentration",
        scope,
        message: `${name}の売上の${c.top1.toFixed(0)}%が1人（${top.talent.name}）に集中しています`,
        href: "/talents",
      },
    ];
  }
  if (c.top3 >= settings.concentrationTop3) {
    return [
      {
        severity: "info",
        category: "concentration",
        scope,
        message: `${name}の売上の${c.top3.toFixed(0)}%が上位3人に集中しています`,
        href: "/talents",
      },
    ];
  }
  return [];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function sortAlerts(alerts: RevenueAlert[]): RevenueAlert[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
