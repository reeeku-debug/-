// 画面表示用のフォーマッター

export function yen(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

/** ¥3.25M / ¥900K のような短縮表記（グラフ軸・狭い欄用） */
export function yenCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}¥${trim(abs / 100_000_000)}億`;
  if (abs >= 10_000) return `${sign}¥${trim(abs / 10_000)}万`;
  return `${sign}¥${Math.round(abs).toLocaleString("ja-JP")}`;
}

function trim(n: number): string {
  return (n >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, "");
}

export function people(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `${Math.round(n).toLocaleString("ja-JP")}人`;
}

export function percent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `${n.toFixed(digits)}%`;
}

/** 前月比などの増減率（+12.4% / -3.0%） */
export function signedPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

export function signedNumber(n: number, unit = ""): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return `${sign}${Math.abs(n).toLocaleString("ja-JP")}${unit}`;
}

export function formatDateJp(date: string | null | undefined): string {
  if (!date) return "-";
  return date.replace(/-/g, "/");
}

export function formatDateTimeJst(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hoursMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "-";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

/** 増減の色（上がるのが良い指標） */
export function trendClass(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "text-gray-500";
  return n > 0 ? "text-emerald-700" : "text-red-600";
}
