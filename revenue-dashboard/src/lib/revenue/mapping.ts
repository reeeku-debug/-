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
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number]["field"];

export interface AppMapping {
  columns: Record<MappingField, string[]>;
  /** 収益列の値に掛ける係数（ポイント→円換算など） */
  revenueMultiplier: number;
  /** 配信時間列の単位: minutes | hours | seconds（"1:23:45" 形式は自動判定） */
  streamDurationUnit: string;
}

const COMMON: Record<MappingField, string[]> = {
  date: ["date", "日付", "集計日", "配信日", "対象日", "年月日"],
  talent_id: ["talent_id", "タレントID", "ライバーID", "配信者ID", "ユーザーID", "user_id", "id"],
  talent_name: ["talent_name", "タレント名", "ライバー名", "配信者名", "ユーザー名", "名前", "name", "display_name"],
  revenue: ["revenue", "配信収益", "収益", "収益(円)", "報酬", "報酬額", "報酬額(円)", "売上", "earnings", "amount"],
  record_id: ["record_id", "レコードID", "配信ID", "stream_id"],
  stream_minutes: ["stream_minutes", "配信時間", "配信時間(分)", "duration"],
  stream_count: ["stream_count", "配信回数", "配信数", "枠数"],
};

function withCommon(overrides: Partial<Record<MappingField, string[]>>): Record<MappingField, string[]> {
  const result = {} as Record<MappingField, string[]>;
  for (const { field } of MAPPING_FIELDS) {
    result[field] = [...(overrides[field] ?? []), ...COMMON[field]];
  }
  return result;
}

// ※ 以下はダミーデータ用に仮定したカラム名。実CSV受領後に MAPPING シートで上書きする。
export const DEFAULT_MAPPINGS: Record<string, AppMapping> = {
  IRIAM: {
    columns: withCommon({ revenue: ["報酬額(円)"], stream_minutes: ["配信時間(分)"] }),
    revenueMultiplier: 1,
    streamDurationUnit: "minutes",
  },
  Avvy: {
    columns: withCommon({ date: ["date"], talent_id: ["user_id"], revenue: ["earnings"], stream_minutes: ["stream_seconds"] }),
    revenueMultiplier: 1,
    streamDurationUnit: "seconds",
  },
  Mirrativ: {
    columns: withCommon({ date: ["集計日"], talent_id: ["配信者ID"], revenue: ["収益(円)"], stream_count: ["配信数"] }),
    revenueMultiplier: 1,
    streamDurationUnit: "minutes",
  },
};

const FALLBACK_MAPPING: AppMapping = {
  columns: withCommon({}),
  revenueMultiplier: 1,
  streamDurationUnit: "minutes",
};

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s　]/g, "").replace(/（/g, "(").replace(/）/g, ")");
}

/**
 * MAPPING シート（アプリ / 項目 / 値）による上書きを反映したマッピングを返す。
 * 項目には MAPPING_FIELDS の field か、revenue_multiplier / stream_duration_unit を指定する。
 * 列名は「,」区切りで複数候補を指定可能。上書きした項目はデフォルト候補より優先される。
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
