// 期間指定（当月 / 前月 / 今月累計 / 指定月 / 任意期間）の解決

import { addDays, addMonths, diffDays, monthEnd, monthOf, monthStart, parseDate, parseMonth } from "./parse";

export type PeriodKind = "cur" | "prev" | "mtd" | "month" | "custom";

export interface Period {
  kind: PeriodKind;
  label: string;
  /** 期間の開始日・終了日（両端含む） */
  start: string;
  end: string;
  /** 集計対象の最終日（未来日を含まない） */
  dataEnd: string;
  /** 比較期間（前月比の分母） */
  compareStart: string;
  compareEnd: string;
  compareLabel: string;
  /** 期間がちょうど1か月の場合その年月（KPIの目標月） */
  month: string | null;
  /** 期間が今日を含み、まだ終わっていない */
  inProgress: boolean;
  elapsedDays: number;
  totalDays: number;
}

export interface PeriodParams {
  p?: string;
  m?: string;
  from?: string;
  to?: string;
}

function formatShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/**
 * 進行中の期間の経過日数。CSVは前日分までを毎日取り込む運用のため、
 * 今日は「経過済み」に含めない（前月同期間の比較・着地見込みの計算に使う）。
 */
function completedDays(start: string, end: string, today: string): number {
  if (today <= start) return 0;
  if (today > end) return diffDays(start, end) + 1;
  return diffDays(start, today);
}

function sameDaysOfPreviousMonth(month: string, days: number) {
  const prevMonth = addMonths(month, -1);
  const prevStart = monthStart(prevMonth);
  const prevEnd = monthEnd(prevMonth);
  const clipped = addDays(prevStart, Math.max(1, days) - 1);
  const compareEnd = clipped < prevEnd ? clipped : prevEnd;
  return {
    compareStart: prevStart,
    compareEnd,
    compareLabel: `前月同期間（${formatShort(prevStart)}〜${formatShort(compareEnd)}）`,
  };
}

function monthPeriod(kind: PeriodKind, month: string, today: string, labelPrefix?: string): Period {
  const start = monthStart(month);
  const end = monthEnd(month);
  const totalDays = diffDays(start, end) + 1;
  const inProgress = today >= start && today <= end;
  const dataEnd = today < end ? (today < start ? start : today) : end;
  const elapsedDays = completedDays(start, end, today);
  const prevMonth = addMonths(month, -1);
  const compare = inProgress
    ? sameDaysOfPreviousMonth(month, elapsedDays)
    : { compareStart: monthStart(prevMonth), compareEnd: monthEnd(prevMonth), compareLabel: `前月（${monthLabel(prevMonth)}）` };
  return {
    kind,
    label: labelPrefix ? `${labelPrefix}（${monthLabel(month)}）` : monthLabel(month),
    start,
    end,
    dataEnd,
    ...compare,
    month,
    inProgress,
    elapsedDays,
    totalDays,
  };
}

export function resolvePeriod(params: PeriodParams, today: string): Period {
  const currentMonth = monthOf(today);
  switch (params.p) {
    case "prev":
      return monthPeriod("prev", addMonths(currentMonth, -1), today, "前月");
    case "mtd": {
      const start = monthStart(currentMonth);
      const elapsedDays = completedDays(start, monthEnd(currentMonth), today);
      return {
        kind: "mtd",
        label: `今月累計（${formatShort(start)}〜${formatShort(today)}）`,
        start,
        end: today,
        dataEnd: today,
        ...sameDaysOfPreviousMonth(currentMonth, elapsedDays),
        month: currentMonth,
        inProgress: true,
        elapsedDays,
        totalDays: diffDays(start, monthEnd(currentMonth)) + 1,
      };
    }
    case "month": {
      const m = parseMonth(params.m);
      if (m) return monthPeriod("month", m, today);
      break;
    }
    case "custom": {
      let from = parseDate(params.from);
      let to = parseDate(params.to);
      if (from && to) {
        if (from > to) [from, to] = [to, from];
        const len = diffDays(from, to) + 1;
        const compareEnd = addDays(from, -1);
        const compareStart = addDays(compareEnd, -(len - 1));
        const dataEnd = to < today ? to : today < from ? from : today;
        const isWholeMonth = from === monthStart(monthOf(from)) && to === monthEnd(monthOf(from));
        return {
          kind: "custom",
          label: `${from.replace(/-/g, "/")} 〜 ${to.replace(/-/g, "/")}`,
          start: from,
          end: to,
          dataEnd,
          compareStart,
          compareEnd,
          compareLabel: `前期間（${compareStart.replace(/-/g, "/")}〜${compareEnd.replace(/-/g, "/")}）`,
          month: isWholeMonth ? monthOf(from) : null,
          inProgress: today >= from && today <= to,
          elapsedDays: completedDays(from, to, today),
          totalDays: len,
        };
      }
      break;
    }
  }
  return monthPeriod("cur", currentMonth, today, "当月");
}

/** 期間を URL クエリ文字列に戻す（リンク生成用） */
export function periodQuery(params: PeriodParams): string {
  const q = new URLSearchParams();
  if (params.p) q.set("p", params.p);
  if (params.p === "month" && params.m) q.set("m", params.m);
  if (params.p === "custom") {
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
