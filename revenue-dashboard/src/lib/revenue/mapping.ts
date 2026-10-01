// アプリごとのCSVカラム → 共通フォーマットのマッピング定義。
//
// 実際のCSVのカラム名が確定・変更された場合は、
//   1. スプレッドシートの MAPPING シートに行を追加する（再デプロイ不要・推奨）
//   2. もしくは下記 DEFAULT_MAPPINGS の候補リストに列名を追加する
// のどちらかで対応でき、ダッシュボード本体の修正は不要。
//
// 候補リストは先頭から順に、CSVのヘッダーと照合される（空白・大文字小文字は無視）。

import type { RawTable } from "./types";
import { findApp } from "./apps";

export const MAPPING_FIELDS = [
  { field: "date", label: "日付", required: true },
  { field: "talent_id", label: "タレントID", required: true },
  { field: "talent_name", label: "タレント名", required: false },
  { field: "revenue", label: "配信収益", required: true },
  { field: "record_id", label: "レコードID（1日複数行の場合）", required: false },
  { field: "stream_minutes", label: "配信時間", required: false },
  { field: "stream_count", label: "配信回数", required: false },
  { field: "stream_days", label: "配信日数（月次データの場合）", required: false },
  { field: "snapshot", label: "出力日（同じ月の累計値が複数ある場合）", required: false },
  { field: "registered_at", label: "登録日（TALENTSの補完用）", required: false },
  { field: "activity_start_at", label: "活動開始日（TALENTSの補完用）", required: false },
  { field: "status", label: "活動ステータス（TALENTSの補完用）", required: false },
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number]["field"];

export interface AppMapping {
  columns: Record<MappingField, string[]>;
  /** 収益列の値に掛ける係数（ポイント→円換算など） */
  revenueMultiplier: number;
  /** 配信時間列の単位: minutes | hours | seconds（"1:23:45" 形式は自動判定） */
  streamDurationUnit: string;
  /**
   * 1回の取込の中に同じキー（アプリ+日付+タレントID）の行が複数あるときの扱い
   *   sum    … 合算する（1日に複数配信の行がある日次CSV）
   *   latest … 出力日（snapshot）が最も新しい行だけを使う（月途中の累計値を何度も出力する月次CSV）
   */
  sameKey: "sum" | "latest";
}

const COMMON: Record<MappingField, string[]> = {
  date: ["date", "日付", "集計日", "配信日", "対象日", "年月日"],
  talent_id: ["talent_id", "タレントID", "ライバーID", "配信者ID", "ユーザーID", "user_id", "id"],
  talent_name: ["talent_name", "タレント名", "ライバー名", "配信者名", "ユーザー名", "名前", "name", "display_name"],
  revenue: ["revenue", "配信収益", "収益", "収益(円)", "報酬", "報酬額", "報酬額(円)", "売上", "earnings", "amount"],
  record_id: ["record_id", "レコードID", "配信ID", "stream_id"],
  stream_minutes: ["stream_minutes", "配信時間", "配信時間(分)", "duration"],
  stream_count: ["stream_count", "配信回数", "配信数", "枠数"],
  stream_days: ["stream_days", "配信日数"],
  snapshot: ["snapshot_date", "出力日", "取得日"],
  registered_at: ["registered_at", "agency_joined_date", "登録日", "所属日", "事務所加入日"],
  activity_start_at: ["activity_start_at", "first_stream_date", "初配信日", "活動開始日", "配信開始日"],
  status: ["membership_status", "ステータス", "活動状況", "status"],
};

function withCommon(overrides: Partial<Record<MappingField, string[]>>): Record<MappingField, string[]> {
  const result = {} as Record<MappingField, string[]>;
  for (const { field } of MAPPING_FIELDS) {
    result[field] = [...(overrides[field] ?? []), ...COMMON[field]];
  }
  return result;
}

export const DEFAULT_MAPPINGS: Record<string, AppMapping> = {
  // IRIAM は実際の配信レポートCSV（集計期間ごとのタレント別集計）に合わせた定義。
  // 収益は「時間ダイヤ＋応援ダイヤ」（1ダイヤ＝1円）。同じ開始日のレポートは集計終了日が新しい方を採用。
  IRIAM: {
    columns: withCommon({
      date: ["集計開始日"],
      talent_id: ["User ID"],
      talent_name: ["アカウント名"],
      revenue: ["時間ダイヤ+応援ダイヤ"],
      stream_minutes: ["総配信時間"],
      stream_count: ["配信回数"],
      stream_days: ["配信日数"],
      snapshot: ["集計終了日"],
      registered_at: ["オーガナイザー登録日"],
      activity_start_at: ["初回配信日時"],
    }),
    revenueMultiplier: 1,
    streamDurationUnit: "hours",
    sameKey: "latest",
  },
  // Avvy は実際の出力CSV（タレント×月の累計スナップショット、収益はダイヤ）に合わせた定義。
  // 1ダイヤ＝0.8円で円換算する（レートが変わったら MAPPING シートの revenue_multiplier で上書き）。
  Avvy: {
    columns: withCommon({
      date: ["target_month"],
      talent_id: ["user_id"],
      talent_name: ["account_name"],
      revenue: ["diamonds"],
      stream_minutes: ["stream_hours"],
      stream_count: ["stream_count"],
      stream_days: ["stream_days"],
      snapshot: ["snapshot_date"],
    }),
    revenueMultiplier: 0.8,
    streamDurationUnit: "hours",
    sameKey: "latest",
  },
  // Mirrativ はダミーデータ用に仮定したカラム名（実CSV受領後に調整）。
  // 固定レートがないため、CSVの円建ての金額列を使う想定。
  Mirrativ: {
    columns: withCommon({ date: ["集計日"], talent_id: ["配信者ID"], revenue: ["収益(円)"], stream_count: ["配信数"] }),
    revenueMultiplier: 1,
    streamDurationUnit: "minutes",
    sameKey: "sum",
  },
};

const FALLBACK_MAPPING: AppMapping = {
  columns: withCommon({}),
  revenueMultiplier: 1,
  streamDurationUnit: "minutes",
  sameKey: "sum",
};

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s　]/g, "").replace(/（/g, "(").replace(/）/g, ")");
}

/**
 * MAPPING シート（アプリ / 項目 / 値）による上書きを反映したマッピングを返す。
 * 項目には MAPPING_FIELDS の field か、revenue_multiplier / stream_duration_unit / same_key を指定する。
 * 列名は「,」区切りで複数候補を指定可能。上書きした項目はデフォルト候補より優先される。
 * 「列A+列B」と書くと、その列の合計を値として使う（収益が複数の列に分かれている場合）。
 */
export function resolveMappings(mappingSheet: RawTable | null): Record<string, AppMapping> {
  const result: Record<string, AppMapping> = {};
  for (const [app, m] of Object.entries(DEFAULT_MAPPINGS)) {
    result[app] = { ...m, columns: { ...m.columns } };
  }
  if (!mappingSheet) return result;

  const idx = columnIndexer(mappingSheet.headers);
  const appCol = idx(["アプリ", "app"]);
  const fieldCol = idx(["項目", "field"]);
  const valueCol = idx(["値", "value", "列名", "column"]);
  if (appCol < 0 || fieldCol < 0 || valueCol < 0) return result;

  for (const row of mappingSheet.rows) {
    const app = findApp(row[appCol]);
    const field = (row[fieldCol] ?? "").trim();
    const value = (row[valueCol] ?? "").trim();
    if (!app || !field || !value) continue;
    const mapping = result[app.id] ?? (result[app.id] = { ...FALLBACK_MAPPING, columns: { ...FALLBACK_MAPPING.columns } });
    if (field === "revenue_multiplier") {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) mapping.revenueMultiplier = n;
    } else if (field === "stream_duration_unit") {
      mapping.streamDurationUnit = value;
    } else if (field === "same_key") {
      if (value === "sum" || value === "latest") mapping.sameKey = value;
    } else if (MAPPING_FIELDS.some((f) => f.field === field)) {
      const key = field as MappingField;
      const custom = value.split(/[,、]/).map((v) => v.trim()).filter(Boolean);
      mapping.columns[key] = [...custom, ...mapping.columns[key].filter((c) => !custom.includes(c))];
    }
  }
  return result;
}

export function getMapping(mappings: Record<string, AppMapping>, app: string): AppMapping {
  return mappings[app] ?? FALLBACK_MAPPING;
}

/** 候補リストのうち、ヘッダーに最初に一致した列のインデックス（なければ -1） */
export function findColumn(headers: string[], candidates: string[]): number {
  const keys = headers.map(headerKey);
  for (const c of candidates) {
    const i = keys.indexOf(headerKey(c));
    if (i >= 0) return i;
  }
  return -1;
}

export function columnIndexer(headers: string[]) {
  return (candidates: string[]) => findColumn(headers, candidates);
}

/** 各項目について、ヘッダーに一致した列のインデックスを候補順にすべて返す */
export function resolveColumns(headers: string[], mapping: AppMapping): Record<MappingField, number[]> {
  const keys = headers.map(headerKey);
  const result = {} as Record<MappingField, number[]>;
  for (const { field } of MAPPING_FIELDS) {
    const found: number[] = [];
    for (const c of mapping.columns[field]) {
      const i = keys.indexOf(headerKey(c));
      if (i >= 0 && !found.includes(i)) found.push(i);
    }
    result[field] = found;
  }
  return result;
}

/**
 * 候補を列グループに解決する。「列A+列B」の候補はすべての列がある場合だけ1グループになる。
 * 収益のように複数列の合計を取りたい項目で使う。
 */
export function resolveColumnGroups(headers: string[], candidates: string[]): number[][] {
  const keys = headers.map(headerKey);
  const groups: number[][] = [];
  for (const c of candidates) {
    const parts = c.split("+").map((p) => keys.indexOf(headerKey(p)));
    if (parts.every((i) => i >= 0) && !groups.some((g) => g.join() === parts.join())) groups.push(parts);
  }
  return groups;
}

/** 最初に値が入っている列グループの合計（どの列も空なら null） */
export function pickNumberSum(row: string[], groups: number[][], parse: (v: string) => number | null): number | null {
  for (const g of groups) {
    const values = g.map((i) => String(row[i] ?? "").trim());
    if (values.every((v) => v === "")) continue;
    let total = 0;
    for (const v of values) {
      const n = v === "" ? 0 : parse(v);
      if (n === null) return null;
      total += n;
    }
    return total;
  }
  return null;
}

/** 列名から配信時間の単位を推定する（分かれば列名を優先、なければアプリの既定単位） */
export function durationUnitForHeader(header: string, fallback: string): string {
  const h = header.toLowerCase();
  if (/秒|sec/.test(h)) return "seconds";
  if (/分|min/.test(h)) return "minutes";
  if (/hour|\(h\)|（h）|\(時間\)/.test(h)) return "hours";
  return fallback;
}

/** pickValue と同じだが、値を取り出した列のインデックスも返す */
export function pickValueWithColumn(row: string[], columns: number[]): { value: string; column: number } {
  for (const i of columns) {
    const v = row[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") return { value: String(v).trim(), column: i };
  }
  return { value: "", column: -1 };
}

/**
 * 行から項目の値を取り出す。一致した列が複数ある場合（CSVのカラム名が途中で
 * 変わり、RAWシートに新旧両方の列がある場合など）は、最初に値が入っている列を使う。
 */
export function pickValue(row: string[], columns: number[]): string {
  for (const i of columns) {
    const v = row[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
