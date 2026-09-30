import type { RawDataset, RawTable } from "../types";

/**
 * データソースの共通インターフェース。
 * ダミーデータ（demo）と Google スプレッドシート（gas: Apps Script 経由 / sheets: Sheets API）を同じ形で扱う。
 * 他の保存先（DB・別API）に切り替える場合もこのインターフェースを実装すればよい。
 */
export interface RevenueDataSource {
  kind: "demo" | "sheets" | "gas";
  label: string;
  /** 書き込み（CSV取込・KPI保存・設定保存）が可能か */
  writable: boolean;
  load(): Promise<RawDataset>;
  /** シートに行を追記する。既存ヘッダーにない列はヘッダーに追加する */
  appendRows(sheet: string, headers: string[], rows: string[][]): Promise<void>;
  /** シートの内容をヘッダーごと置き換える */
  replaceSheet(sheet: string, table: RawTable): Promise<void>;
  /** 不足しているシートを作成し、作成したシート名を返す */
  ensureSheets(defs: Array<{ name: string; headers: string[] }>): Promise<string[]>;
}

/** シート名の定義 */
export const SHEET_NAMES = {
  talents: "TALENTS",
  kpi: "KPI",
  mapping: "MAPPING",
  settings: "SETTINGS",
} as const;

export const TALENTS_HEADERS = ["talent_id", "タレント名", "アプリ", "登録日", "活動開始日", "ステータス"];
export const KPI_HEADERS = ["年月", "アプリ", "KPI項目", "目標値", "タレントID"];
export const MAPPING_HEADERS = ["アプリ", "項目", "値"];
export const SETTINGS_HEADERS = ["項目", "値"];

/** 追記時に既存ヘッダーと新しいヘッダーを統合し、行を並べ替える */
export function mergeRowsIntoTable(existing: RawTable, headers: string[], rows: string[][]): RawTable {
  const merged = [...existing.headers];
  for (const h of headers) if (!merged.includes(h)) merged.push(h);
  const indexes = headers.map((h) => merged.indexOf(h));
  const aligned = rows.map((row) => {
    const out = new Array<string>(merged.length).fill("");
    indexes.forEach((to, from) => {
      out[to] = row[from] ?? "";
    });
    return out;
  });
  return {
    headers: merged,
    rows: [...existing.rows.map((r) => merged.map((_, i) => r[i] ?? "")), ...aligned],
  };
}
