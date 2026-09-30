// RAW DATA → 共通フォーマットへの変換（NORMALIZE / TRANSFORM）。
// CSVの形式変更はここと mapping.ts で吸収し、集計・画面側には影響させない。

import { APPS, findApp, isAllApps, ALL_APPS_ID } from "./apps";
import { findKpiDefinition } from "./kpi-definitions";
import {
  MAPPING_FIELDS,
  columnIndexer,
  getMapping,
  pickValue,
  resolveColumns,
  resolveMappings,
  type AppMapping,
} from "./mapping";
import { parseDate, parseDurationMinutes, parseMonth, parseNumber } from "./parse";
import {
  DEFAULT_SETTINGS,
  type KpiTarget,
  type MappingReport,
  type RawDataset,
  type RawTable,
  type RevenueModel,
  type RevenueRecord,
  type RevenueSettings,
  type Talent,
} from "./types";

/** 取込時に RAW シートへ追記する管理用カラム */
export const IMPORT_ID_COLUMN = "_import_id";
export const IMPORTED_AT_COLUMN = "_imported_at";

export function recordKey(app: string, date: string, talentId: string, recordId: string | null): string {
  return [app, date, talentId, recordId ?? ""].join("|");
}

interface RowWithBatch {
  record: RevenueRecord;
  /** 取込日時（エポックミリ秒。不明な行は 0） */
  importedAt: number;
  batchId: string;
  order: number;
}

export interface NormalizeRawResult {
  records: RevenueRecord[];
  report: MappingReport;
  lastImportedAt: string | null;
  /** 入力行ごとの重複判定キー（変換できなかった行は null） */
  rowKeys: Array<string | null>;
}

function isNewerBatch(a: RowWithBatch, b: RowWithBatch): boolean {
  if (a.importedAt !== b.importedAt) return a.importedAt > b.importedAt;
  if (a.batchId !== b.batchId) return a.order > b.order;
  return false;
}

/**
 * 1アプリ分のRAWシートを共通フォーマットに変換する。
 *
 * 重複の扱い：
 *   同じキー（app + date + talent_id [+ record_id]）の行が複数ある場合、
 *   最も新しい取込バッチ（_imported_at / _import_id）の行だけを採用する。
 *   同じバッチ内に同じキーの行が複数ある場合（1日に複数配信があるCSVで
 *   record_id を持たない場合など）は合算する。
 *   → 同じCSVを何度取り込んでも二重計上されず、修正版CSVを取り込めば上書きされる。
 */
export function normalizeRawTable(app: string, sheet: string, table: RawTable, mapping: AppMapping): NormalizeRawResult {
  const cols = resolveColumns(table.headers, mapping);
  const idx = columnIndexer(table.headers);
  const batchIdCol = idx([IMPORT_ID_COLUMN]);
  const importedAtCol = idx([IMPORTED_AT_COLUMN]);

  const report: MappingReport = {
    app,
    sheet,
    headers: table.headers.filter((h) => h !== IMPORT_ID_COLUMN && h !== IMPORTED_AT_COLUMN),
    rowCount: table.rows.length,
    fields: MAPPING_FIELDS.map((f) => ({
      field: f.field,
      label: f.label,
      required: f.required,
      candidates: mapping.columns[f.field],
      matchedColumn: cols[f.field].length > 0 ? cols[f.field].map((i) => table.headers[i]).join(" / ") : null,
    })),
    revenueMultiplier: mapping.revenueMultiplier,
    streamDurationUnit: mapping.streamDurationUnit,
    validRecords: 0,
    skippedRows: 0,
    duplicateRows: 0,
    errors: [],
    sampleErrors: [],
  };

  const missing = report.fields.filter((f) => f.required && !f.matchedColumn);
  if (table.headers.length > 0 && missing.length > 0) {
    report.errors.push(`必須項目の列が見つかりません: ${missing.map((f) => f.label).join("、")}`);
  }
  if (missing.length > 0) {
    report.skippedRows = table.rows.length;
    return { records: [], report, lastImportedAt: null, rowKeys: table.rows.map(() => null) };
  }

  let lastImportedAtMs = 0;
  let lastImportedAt: string | null = null;
  const rowKeys: Array<string | null> = [];
  const byKey = new Map<string, RowWithBatch[]>();

  table.rows.forEach((row, i) => {
    const rowNo = i + 2; // シート上の行番号（ヘッダーが1行目）
    const date = parseDate(pickValue(row, cols.date));
    const talentId = pickValue(row, cols.talent_id);
    const revenueRaw = parseNumber(pickValue(row, cols.revenue));
    if (!date || !talentId || revenueRaw === null) {
      rowKeys.push(null);
      report.skippedRows++;
      if (report.sampleErrors.length < 5) {
        const reason = !date ? "日付" : !talentId ? "タレントID" : "配信収益";
        report.sampleErrors.push(`${rowNo}行目: ${reason}を読み取れません`);
      }
      return;
    }
    const recordId = pickValue(row, cols.record_id) || null;
    const importedAtRaw = importedAtCol >= 0 ? (row[importedAtCol] ?? "").trim() : "";
    const importedAt = importedAtRaw ? Date.parse(importedAtRaw) || 0 : 0;
    const batchId = batchIdCol >= 0 ? (row[batchIdCol] ?? "").trim() : "";
    if (importedAt > lastImportedAtMs) {
      lastImportedAtMs = importedAt;
      lastImportedAt = importedAtRaw;
    }

    const key = recordKey(app, date, talentId, recordId);
    rowKeys.push(key);
    const minutesRaw = pickValue(row, cols.stream_minutes);
    const countRaw = pickValue(row, cols.stream_count);
    const record: RevenueRecord = {
      date,
      app,
      talentId,
      talentName: pickValue(row, cols.talent_name),
      revenue: Math.round(revenueRaw * mapping.revenueMultiplier),
      recordId,
      streamMinutes: minutesRaw ? parseDurationMinutes(minutesRaw, mapping.streamDurationUnit) : null,
      streamCount: countRaw ? parseNumber(countRaw) : null,
      key,
    };
    const list = byKey.get(key);
    const entry: RowWithBatch = { record, importedAt, batchId, order: i };
    if (list) list.push(entry);
    else byKey.set(key, [entry]);
  });

  const records: RevenueRecord[] = [];
  byKey.forEach((entries) => {
    let latest = entries[0];
    for (const e of entries) if (isNewerBatch(e, latest)) latest = e;
    const chosen = entries
      .filter((e) => e.importedAt === latest.importedAt && e.batchId === latest.batchId)
      .map((e) => e.record);
    report.duplicateRows += entries.length - chosen.length;
    records.push(mergeRecords(chosen));
  });
  records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  report.validRecords = records.length;
  return { records, report, lastImportedAt, rowKeys };
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((s, v) => s + v, 0);
}

export function mergeRecords(records: RevenueRecord[]): RevenueRecord {
  if (records.length === 1) return records[0];
  const base = records[records.length - 1];
  return {
    ...base,
    talentName: records.map((r) => r.talentName).filter(Boolean).pop() ?? "",
    revenue: records.reduce((s, r) => s + r.revenue, 0),
    streamMinutes: sumNullable(records.map((r) => r.streamMinutes)),
    streamCount: sumNullable(records.map((r) => r.streamCount)),
  };
}

// ---- TALENTS ----

export function normalizeTalents(table: RawTable, records: RevenueRecord[], warnings: string[]): Talent[] {
  const idx = columnIndexer(table.headers);
  const idCol = idx(["talent_id", "タレントID", "ID"]);
  const nameCol = idx(["タレント名", "talent_name", "名前", "name"]);
  const appCol = idx(["アプリ", "app", "媒体"]);
  const regCol = idx(["登録日", "registered_at", "配信登録日"]);
  const startCol = idx(["活動開始日", "activity_start_at", "配信開始日"]);
  const statusCol = idx(["ステータス", "status", "活動状況"]);

  const talents = new Map<string, Talent>();
  if (table.headers.length > 0 && (idCol < 0 || appCol < 0)) {
    warnings.push("TALENTSシートに talent_id / アプリ 列が見つかりません");
  } else {
    let unknownApps = 0;
    for (const row of table.rows) {
      const talentId = (row[idCol] ?? "").trim();
      const app = findApp(row[appCol]);
      if (!talentId) continue;
      if (!app) {
        unknownApps++;
        continue;
      }
      const key = `${app.id}:${talentId}`;
      talents.set(key, {
        key,
        app: app.id,
        talentId,
        name: nameCol >= 0 ? (row[nameCol] ?? "").trim() : "",
        registeredAt: regCol >= 0 ? parseDate(row[regCol]) : null,
        activityStartAt: startCol >= 0 ? parseDate(row[startCol]) : null,
        status: statusCol >= 0 ? (row[statusCol] ?? "").trim() || "登録済" : "登録済",
        fromRawOnly: false,
      });
    }
    if (unknownApps > 0) warnings.push(`TALENTSシートでアプリ名を判別できない行が${unknownApps}件あります`);
  }

  // RAWデータにだけ存在するタレントも集計対象に含める
  let rawOnly = 0;
  for (const r of records) {
    const key = `${r.app}:${r.talentId}`;
    const existing = talents.get(key);
    if (existing) {
      if (!existing.name && r.talentName) existing.name = r.talentName;
      continue;
    }
    rawOnly++;
    talents.set(key, {
      key,
      app: r.app,
      talentId: r.talentId,
      name: r.talentName,
      registeredAt: null,
      activityStartAt: null,
      status: "配信開始",
      fromRawOnly: true,
    });
  }
  if (rawOnly > 0) {
    warnings.push(`TALENTSシートに未登録のタレントが${rawOnly}名RAWデータに存在します（登録日不明として集計）`);
  }
  const list = Array.from(talents.values());
  for (const t of list) if (!t.name) t.name = t.talentId;
  return list;
}

// ---- KPI ----

export function normalizeKpis(table: RawTable, warnings: string[]): KpiTarget[] {
  const idx = columnIndexer(table.headers);
  const monthCol = idx(["年月", "month", "対象月"]);
  const appCol = idx(["アプリ", "app", "媒体"]);
  const itemCol = idx(["KPI項目", "項目", "item", "kpi"]);
  const targetCol = idx(["目標値", "目標", "target"]);
  const talentCol = idx(["タレントID", "talent_id"]);
  if (table.headers.length === 0) return [];
  if (monthCol < 0 || appCol < 0 || itemCol < 0 || targetCol < 0) {
    warnings.push("KPIシートに 年月 / アプリ / KPI項目 / 目標値 列が見つかりません");
    return [];
  }

  const map = new Map<string, KpiTarget>();
  for (const row of table.rows) {
    const month = parseMonth(row[monthCol]);
    const target = parseNumber(row[targetCol]);
    const itemLabel = (row[itemCol] ?? "").trim();
    const appRaw = (row[appCol] ?? "").trim();
    if (!month || target === null || !itemLabel) continue;
    const app = isAllApps(appRaw) ? ALL_APPS_ID : findApp(appRaw)?.id;
    if (!app) continue;
    const def = findKpiDefinition(itemLabel);
    const talentId = talentCol >= 0 ? (row[talentCol] ?? "").trim() || null : null;
    const k: KpiTarget = {
      month,
      app,
      item: def ? def.key : `custom:${itemLabel}`,
      itemLabel: def ? def.label : itemLabel,
      target,
      talentId,
    };
    // 同じ年月・アプリ・項目が複数行ある場合は後の行を優先
    map.set([k.month, k.app, k.item, k.talentId ?? ""].join("|"), k);
  }
  return Array.from(map.values());
}

// ---- SETTINGS ----

export const SETTING_LABELS: Record<keyof RevenueSettings, string> = {
  kpiLowRate: "KPI達成率がこの%未満なら要確認",
  revenueDropRate: "前月比で売上がこの%以上減少したら要確認",
  registrationDropRate: "前月比で新規登録がこの%以上減少したら要確認",
  noRevenueDays: "登録後この日数を経過して売上0円なら要確認",
  lowRevenueMinStreamDays: "「配信しているが売上が低い」判定：配信日数がこの日数以上",
  lowRevenuePerDay: "「配信しているが売上が低い」判定：1配信日あたり売上がこの金額未満",
  concentrationTop1: "上位1人の売上比率がこの%以上なら偏り",
  concentrationTop3: "上位3人の売上比率がこの%以上なら偏り",
};

export function normalizeSettings(table: RawTable | null): RevenueSettings {
  const settings: RevenueSettings = { ...DEFAULT_SETTINGS };
  if (!table) return settings;
  const idx = columnIndexer(table.headers);
  const keyCol = idx(["項目", "key"]);
  const valueCol = idx(["値", "value"]);
  if (keyCol < 0 || valueCol < 0) return settings;
  for (const row of table.rows) {
    const key = (row[keyCol] ?? "").trim() as keyof RevenueSettings;
    const value = parseNumber(row[valueCol]);
    if (key in settings && value !== null && value >= 0) settings[key] = value;
  }
  return settings;
}

// ---- まとめ ----

export function buildModel(raw: RawDataset, today: string): RevenueModel {
  const warnings: string[] = [];
  if (raw.missingSheets.length > 0) {
    warnings.push(`スプレッドシートに次のシートがありません: ${raw.missingSheets.join("、")}`);
  }
  const mappings = resolveMappings(raw.mapping);
  const records: RevenueRecord[] = [];
  const mappingReports: MappingReport[] = [];
  let lastImportedAt: string | null = null;

  for (const app of APPS) {
    const table = raw.raw[app.id] ?? { headers: [], rows: [] };
    const result = normalizeRawTable(app.id, app.rawSheet, table, getMapping(mappings, app.id));
    records.push(...result.records);
    mappingReports.push(result.report);
    for (const e of result.report.errors) warnings.push(`${app.rawSheet}: ${e}`);
    if (result.lastImportedAt && (!lastImportedAt || Date.parse(result.lastImportedAt) > Date.parse(lastImportedAt))) {
      lastImportedAt = result.lastImportedAt;
    }
  }

  const talents = normalizeTalents(raw.talents, records, warnings);
  const kpis = normalizeKpis(raw.kpi, warnings);
  const settings = normalizeSettings(raw.settings);
  const latestDataDate = records.reduce<string | null>((max, r) => (!max || r.date > max ? r.date : max), null);

  return { records, talents, kpis, settings, mappingReports, lastImportedAt, latestDataDate, today, warnings };
}
