// 配信収益ダッシュボードのデータモデル
//
//   RAW DATA（各アプリCSVそのまま / スプレッドシート）
//     ↓ normalize.ts（カラムマッピングで共通フォーマットへ変換）
//   NORMALIZED（RevenueRecord / Talent / KpiTarget）
//     ↓ analytics.ts / kpi.ts / alerts.ts
//   ANALYTICS DATA
//     ↓
//   DASHBOARD（src/app/(dashboard)）

/** シート1枚分の生データ。1行目がヘッダー、値はすべて文字列 */
export interface RawTable {
  headers: string[];
  rows: string[][];
}

/** データソースから取得した生データ一式 */
export interface RawDataset {
  /** アプリID → RAWシート */
  raw: Record<string, RawTable>;
  talents: RawTable;
  kpi: RawTable;
  /** カラムマッピングの上書き設定（任意） */
  mapping: RawTable | null;
  /** しきい値などの設定（任意） */
  settings: RawTable | null;
  /** 存在しなかったシート名 */
  missingSheets: string[];
}

/** 共通フォーマットに変換した配信収益レコード */
export interface RevenueRecord {
  date: string; // YYYY-MM-DD
  app: string;
  talentId: string;
  talentName: string;
  revenue: number;
  recordId: string | null;
  streamMinutes: number | null;
  streamCount: number | null;
  /** 重複判定キー（app + date + talent_id [+ record_id]） */
  key: string;
}

export const TALENT_STATUSES = ["登録前", "登録済", "配信準備中", "配信開始", "休止", "卒業"] as const;
export type TalentStatus = (typeof TALENT_STATUSES)[number] | string;

export interface Talent {
  /** app:talentId（アプリをまたいで一意） */
  key: string;
  app: string;
  talentId: string;
  name: string;
  registeredAt: string | null;
  activityStartAt: string | null;
  status: TalentStatus;
  /** TALENTSシートに存在せず、RAWデータからのみ見つかったタレント */
  fromRawOnly: boolean;
}

/** タレント単位の要確認フラグ */
export type TalentFlag = "no_revenue" | "not_streaming" | "low_revenue" | "revenue_drop" | "kpi_low";

export const TALENT_FLAG_LABEL: Record<TalentFlag, string> = {
  no_revenue: "登録後売上なし",
  not_streaming: "未配信",
  low_revenue: "低売上",
  revenue_drop: "売上減少",
  kpi_low: "KPI未達",
};

export interface KpiTarget {
  month: string; // YYYY-MM
  /** アプリID または "全体" */
  app: string;
  /** KPI定義キー（kpi.ts）。未知の項目は "custom:<項目名>" */
  item: string;
  itemLabel: string;
  target: number;
  /** タレント個別KPIの場合のみ */
  talentId: string | null;
}

export interface RevenueSettings {
  /** KPI達成率がこの%未満なら要確認 */
  kpiLowRate: number;
  /** 前月比で売上がこの%以上減少したら要確認 */
  revenueDropRate: number;
  /** 前月比で新規登録がこの%以上減少したら要確認 */
  registrationDropRate: number;
  /** 登録後この日数を経過して売上0円なら要確認 */
  noRevenueDays: number;
  /** 期間内の配信日数がこの日数以上で… */
  lowRevenueMinStreamDays: number;
  /** …1配信日あたり売上がこの金額未満なら「配信しているが売上が低い」 */
  lowRevenuePerDay: number;
  /** 上位1人の売上比率がこの%以上なら偏り */
  concentrationTop1: number;
  /** 上位3人の売上比率がこの%以上なら偏り */
  concentrationTop3: number;
}

export const DEFAULT_SETTINGS: RevenueSettings = {
  kpiLowRate: 50,
  revenueDropRate: 30,
  registrationDropRate: 20,
  noRevenueDays: 7,
  lowRevenueMinStreamDays: 5,
  lowRevenuePerDay: 1000,
  concentrationTop1: 40,
  concentrationTop3: 70,
};

export interface MappingFieldReport {
  field: string;
  label: string;
  required: boolean;
  candidates: string[];
  matchedColumn: string | null;
}

export interface MappingReport {
  app: string;
  sheet: string;
  headers: string[];
  rowCount: number;
  fields: MappingFieldReport[];
  revenueMultiplier: number;
  streamDurationUnit: string;
  validRecords: number;
  skippedRows: number;
  duplicateRows: number;
  /** 必須項目が見つからないなど */
  errors: string[];
  /** 変換できなかった行の例（先頭数件） */
  sampleErrors: string[];
}

/** 正規化・集計の入力になるモデル */
export interface RevenueModel {
  records: RevenueRecord[];
  talents: Talent[];
  kpis: KpiTarget[];
  settings: RevenueSettings;
  mappingReports: MappingReport[];
  /** RAWデータの _imported_at の最大値（ISO文字列） */
  lastImportedAt: string | null;
  /** データの最終日付（YYYY-MM-DD） */
  latestDataDate: string | null;
  today: string;
  warnings: string[];
}
