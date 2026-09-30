// ページ共通：データ読み込み + 期間解決

import { addMonths, monthOf, monthsBetween } from "./parse";
import { periodQuery, resolvePeriod, type PeriodParams } from "./period";
import { loadRevenueData } from "./service";

export type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function periodParams(searchParams: SearchParams): PeriodParams {
  return { p: first(searchParams.p), m: first(searchParams.m), from: first(searchParams.from), to: first(searchParams.to) };
}

export async function revenuePageContext(searchParams: SearchParams) {
  const data = await loadRevenueData();
  const params = periodParams(searchParams);
  const period = resolvePeriod(params, data.model.today);
  const currentMonth = monthOf(data.model.today);
  const earliest = data.model.records.reduce<string>((min, r) => (r.date < min ? r.date : min), data.model.today);
  const startMonth = monthOf(earliest) < addMonths(currentMonth, -35) ? addMonths(currentMonth, -35) : monthOf(earliest);
  const months = monthsBetween(startMonth, currentMonth).reverse();
  return { data, model: data.model, period, query: periodQuery(params), months, param: first };
}
