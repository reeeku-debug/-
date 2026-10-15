// CSV / スプレッドシートのセル値を型に変換するユーティリティ。
// 日付はタイムゾーンの影響を避けるため "YYYY-MM-DD" 文字列で扱う。

const FULLWIDTH_DIGITS = /[０-９．，－＋]/g;

function toHalfWidth(value: string): string {
  return value.replace(FULLWIDTH_DIGITS, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** "¥1,234" "1,234円" "１２３４" "(1,000)" などを数値にする。変換できなければ null */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = toHalfWidth(String(value)).trim();
  if (!s || s === "-") return null;
  // スプレッドシートで 0 が日付表示になったもの（シリアル値0 = 1899/12/30）
  if (/^1899[/\-]12[/\-]3[01]$/.test(s)) return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[¥￥$,\s円]/g, "").replace(/pt$/i, "");
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * 日付を "YYYY-MM-DD" に正規化する。
 * 対応形式: 2026/09/01, 2026-9-1, 2026年9月1日, 20260901, 2026/09/01 12:00:00,
 * ISO 8601, スプレッドシートのシリアル値(数値)
 */
export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return fromSerial(value);
  const s = toHalfWidth(String(value)).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? toDateKey(y, mo, d) : null;
  }
  // 年月だけ（"2026-09" "2026/9" "2026年9月"）は月初日として扱う（月次データ用）
  m = s.match(/^(\d{4})[/\-.年](\d{1,2})月?$/);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    return isValidDate(y, mo, 1) ? toDateKey(y, mo, 1) : null;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? toDateKey(y, mo, d) : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return fromSerial(Number(s));
  return null;
}

/** スプレッドシートの日付シリアル値（1899-12-30 起点）を変換 */
function fromSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** "2026/09" "2026-9" "2026年9月" → "2026-09" */
export function parseMonth(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return fromSerial(value)?.slice(0, 7) ?? null;
  const s = toHalfWidth(String(value)).trim();
  const m = s.match(/^(\d{4})[/\-.年](\d{1,2})/);
  if (m) {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return `${m[1]}-${pad2(mo)}`;
  }
  const m2 = s.match(/^(\d{4})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return null;
}

/**
 * 配信時間を分に変換する。
 * unit: "minutes" | "hours" | "seconds" | "hms"（"1:23:45" / "1時間23分" 形式）
 */
export function parseDurationMinutes(value: unknown, unit: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const s = toHalfWidth(String(value)).trim();
  const hms = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) {
    const h = Number(hms[1]);
    const mi = Number(hms[2]);
    const se = hms[3] ? Number(hms[3]) : 0;
    return h * 60 + mi + se / 60;
  }
  const jp = s.match(/^(?:(\d+)時間)?(?:(\d+)分)?(?:(\d+)秒)?$/);
  if (jp && (jp[1] || jp[2] || jp[3])) {
    return Number(jp[1] ?? 0) * 60 + Number(jp[2] ?? 0) + Number(jp[3] ?? 0) / 60;
  }
  const n = parseNumber(s);
  if (n === null) return null;
  switch (unit) {
    case "hours":
      return n * 60;
    case "seconds":
      return n / 60;
    default:
      return n;
  }
}

// ---- 日付計算（"YYYY-MM-DD" 文字列ベース） ----

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dateToUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcToDate(ms: number): string {
  const d = new Date(ms);
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: string, days: number): string {
  return utcToDate(dateToUtc(date) + days * 86400000);
}

/** a から b までの日数（b - a） */
export function diffDays(a: string, b: string): number {
  return Math.round((dateToUtc(b) - dateToUtc(a)) / 86400000);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return toDateKey(y, m, daysInMonth(y, m));
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthsBetween(startMonth: string, endMonth: string): string[] {
  const result: string[] = [];
  let cur = startMonth;
  while (cur <= endMonth && result.length < 600) {
    result.push(cur);
    cur = addMonths(cur, 1);
  }
  return result;
}

/** 日本時間の今日 */
export function todayJst(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}
