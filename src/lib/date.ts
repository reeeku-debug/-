const TIME_ZONE = "Asia/Tokyo";

/** 例: 2026/08/28 15:32 (日本時間で表示) */
export function formatDateTimeJST(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\//g, "/")
    .replace(",", "");
}

function jstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** 日本時間での「今日」の日付キー(YYYY-MM-DD)を返す */
export function jstDayKey(date: Date): string {
  const { year, month, day } = jstParts(date);
  return `${year}-${month}-${day}`;
}

/** 日本時間での「今月」の月キー(YYYY-MM)を返す */
export function jstMonthKey(date: Date): string {
  const { year, month } = jstParts(date);
  return `${year}-${month}`;
}
