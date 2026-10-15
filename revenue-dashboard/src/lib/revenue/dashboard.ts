// 画面単位の集計結果をまとめて作る（全体 → アプリ → タレント → KPI）

import { APPS, ALL_APPS_ID } from "./apps";
import {
  concentration,
  monthlySeries,
  scopeKpis,
  scopeMetrics,
  talentRows,
  type Concentration,
  type MonthlyPoint,
  type ScopeMetrics,
  type TalentRow,
} from "./analytics";
import {
  concentrationAlerts,
  kpiAlerts,
  scopeAlerts,
  sortAlerts,
  talentAlerts,
  type RevenueAlert,
} from "./alerts";
import type { KpiEvaluation } from "./kpi";
import { monthOf } from "./parse";
import type { Period } from "./period";
import type { RevenueModel } from "./types";

export interface ScopeSummary {
  metrics: ScopeMetrics;
  kpis: KpiEvaluation[];
}

export interface Overview {
  total: ScopeSummary;
  apps: Record<string, ScopeSummary>;
  rows: TalentRow[];
  concentration: Concentration;
  alerts: RevenueAlert[];
  monthly: MonthlyPoint[];
}

export function buildOverview(model: RevenueModel, period: Period): Overview {
  const totalMetrics = scopeMetrics(model, period, ALL_APPS_ID);
  const total = { metrics: totalMetrics, kpis: scopeKpis(model, period, totalMetrics) };
  const apps: Record<string, ScopeSummary> = {};
  for (const app of APPS) {
    const metrics = scopeMetrics(model, period, app.id);
    apps[app.id] = { metrics, kpis: scopeKpis(model, period, metrics) };
  }
  const rows = talentRows(model, period, ALL_APPS_ID);
  const conc = concentration(rows);

  const alerts: RevenueAlert[] = [
    ...kpiAlerts(total.kpis),
    ...APPS.flatMap((a) => kpiAlerts(apps[a.id].kpis)),
    ...scopeAlerts(totalMetrics, model.settings),
    ...APPS.flatMap((a) => scopeAlerts(apps[a.id].metrics, model.settings)),
    ...concentrationAlerts(ALL_APPS_ID, conc, model.settings),
    ...talentAlerts(rows, model.settings),
  ];

  return {
    total,
    apps,
    rows,
    concentration: conc,
    alerts: sortAlerts(alerts),
    monthly: monthlySeries(model, monthOf(period.end)),
  };
}

export interface AppOverview {
  summary: ScopeSummary;
  rows: TalentRow[];
  concentration: Concentration;
  alerts: RevenueAlert[];
  monthly: MonthlyPoint[];
}

export function buildAppOverview(model: RevenueModel, period: Period, appId: string): AppOverview {
  const metrics = scopeMetrics(model, period, appId);
  const summary = { metrics, kpis: scopeKpis(model, period, metrics) };
  const rows = talentRows(model, period, appId);
  const conc = concentration(rows);
  const alerts = sortAlerts([
    ...kpiAlerts(summary.kpis),
    ...scopeAlerts(metrics, model.settings),
    ...concentrationAlerts(appId, conc, model.settings),
    ...talentAlerts(rows, model.settings),
  ]);
  return { summary, rows, concentration: conc, alerts, monthly: monthlySeries(model, monthOf(period.end)) };
}
