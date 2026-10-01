// CSV取込：アップロードされたCSVを RAW シートへ追記する（重複は追記しない）

import { findApp } from "./apps";
import { parseCsv } from "./csv";
import type { RevenueDataSource } from "./datasource/types";
import { SHEET_NAMES, TALENTS_HEADERS } from "./datasource/types";
import { getMapping, resolveMappings } from "./mapping";
import { IMPORT_ID_COLUMN, IMPORTED_AT_COLUMN, normalizeRawTable, normalizeTalents } from "./normalize";
import type { MappingReport, RawDataset, RevenueRecord } from "./types";

export interface ImportResult {
  ok: boolean;
  dryRun: boolean;
  app: string;
  sheet: string;
  fileName: string;
  /** CSVのデータ行数 */
  fileRows: number;
  /** 取り込めた（変換できた）行数 */
  validRows: number;
  invalidRows: number;
  /** 新しいキー（未取込のデータ） */
  newRecords: number;
  /** 既存キーだが値が変わっていたデータ（修正版として上書き） */
  updatedRecords: number;
  /** 既存と同じ内容のため追記しなかったデータ */
  duplicateRecords: number;
  /** RAWシートに追記した行数 */
  appendedRows: number;
  /** TALENTSシートに追加したタレント数 */
  addedTalents: number;
  period: { from: string; to: string } | null;
  mapping: MappingReport | null;
  errors: string[];
  sampleErrors: string[];
}

function sameValues(a: RevenueRecord, b: RevenueRecord): boolean {
  const eq = (x: number | null, y: number | null) =>
    x === null || y === null ? x === y : Math.abs(x - y) < 0.01;
  return (
    a.revenue === b.revenue &&
    eq(a.streamMinutes, b.streamMinutes) &&
    eq(a.streamCount, b.streamCount) &&
    eq(a.streamDays, b.streamDays)
  );
}

/** 日本時間の ISO 文字列（例: 2026-09-30T15:30:00+09:00） */
export function jstTimestamp(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${jst.toISOString().slice(0, 19)}+09:00`;
}

export interface ImportOptions {
  source: RevenueDataSource;
  raw: RawDataset;
  appId: string;
  fileName: string;
  text: string;
  dryRun: boolean;
  /** CSVにあってTALENTSシートにないタレントをTALENTSシートへ追加する */
  addTalents: boolean;
  now?: Date;
}

export async function importCsv(opts: ImportOptions): Promise<ImportResult> {
  const app = findApp(opts.appId);
  const result: ImportResult = {
    ok: false,
    dryRun: opts.dryRun,
    app: app?.id ?? opts.appId,
    sheet: app?.rawSheet ?? "",
    fileName: opts.fileName,
    fileRows: 0,
    validRows: 0,
    invalidRows: 0,
    newRecords: 0,
    updatedRecords: 0,
    duplicateRecords: 0,
    appendedRows: 0,
    addedTalents: 0,
    period: null,
    mapping: null,
    errors: [],
    sampleErrors: [],
  };
  if (!app) {
    result.errors.push("アプリを選択してください");
    return result;
  }

  const csv = parseCsv(opts.text);
  // 管理用カラムがCSVに含まれていても取込時に付け直す
  const keep = csv.headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h && h !== IMPORT_ID_COLUMN && h !== IMPORTED_AT_COLUMN);
  const headers = keep.map((k) => k.h);
  const rows = csv.rows.map((r) => keep.map((k) => r[k.i] ?? ""));
  result.fileRows = rows.length;
  if (headers.length === 0 || rows.length === 0) {
    result.errors.push("CSVにデータ行がありません");
    return result;
  }

  const mapping = getMapping(resolveMappings(opts.raw.mapping), app.id);
  const incoming = normalizeRawTable(app.id, app.rawSheet, { headers, rows }, mapping);
  result.mapping = incoming.report;
  result.sampleErrors = incoming.report.sampleErrors;
  result.invalidRows = incoming.report.skippedRows;
  result.validRows = rows.length - incoming.report.skippedRows;
  if (incoming.report.errors.length > 0) {
    result.errors.push(
      ...incoming.report.errors,
      "設定画面のカラムマッピング、またはスプレッドシートの MAPPING シートで列名を指定してください"
    );
    return result;
  }

  const existingTable = opts.raw.raw[app.id] ?? { headers: [], rows: [] };
  const existing = normalizeRawTable(app.id, app.rawSheet, existingTable, mapping);
  const existingByKey = new Map(existing.records.map((r) => [r.key, r]));

  const keysToAppend = new Set<string>();
  for (const rec of incoming.records) {
    const prev = existingByKey.get(rec.key);
    if (!prev) {
      result.newRecords++;
      keysToAppend.add(rec.key);
    } else if (!sameValues(prev, rec)) {
      result.updatedRecords++;
      keysToAppend.add(rec.key);
    } else {
      result.duplicateRecords++;
    }
  }
  const dates = incoming.records.map((r) => r.date).sort();
  if (dates.length > 0) result.period = { from: dates[0], to: dates[dates.length - 1] };

  const now = opts.now ?? new Date();
  const importedAt = jstTimestamp(now);
  const importId = `${app.id}-${importedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const toAppend = rows
    .filter((_, i) => {
      const key = incoming.rowKeys[i];
      return key !== null && keysToAppend.has(key);
    })
    .map((r) => [...r, importId, importedAt]);
  result.appendedRows = toAppend.length;

  // TALENTSシートに未登録のタレント
  const knownTalents = new Set(
    normalizeTalents(opts.raw.talents, [], []).map((t) => `${t.app}:${t.talentId}`)
  );
  const infoByKey = new Map(incoming.talentInfos.map((i) => [`${i.app}:${i.talentId}`, i]));
  const newTalents = new Map<string, RevenueRecord>();
  for (const rec of incoming.records) {
    const key = `${rec.app}:${rec.talentId}`;
    if (!knownTalents.has(key) && !newTalents.has(key)) newTalents.set(key, rec);
  }
  if (opts.addTalents) result.addedTalents = newTalents.size;

  if (!opts.dryRun) {
    if (toAppend.length > 0) {
      await opts.source.appendRows(app.rawSheet, [...headers, IMPORT_ID_COLUMN, IMPORTED_AT_COLUMN], toAppend);
    }
    if (opts.addTalents && newTalents.size > 0) {
      await opts.source.appendRows(
        SHEET_NAMES.talents,
        TALENTS_HEADERS,
        Array.from(newTalents.values()).map((r) => {
          // CSVに登録日・初配信日・状態があれば TALENTS にも書き込む
          const info = infoByKey.get(`${r.app}:${r.talentId}`);
          const slash = (d: string | null | undefined) => (d ? d.replace(/-/g, "/") : "");
          return [
            r.talentId,
            info?.name || r.talentName,
            app.id,
            slash(info?.registeredAt),
            slash(info?.activityStartAt),
            info?.status ?? "配信開始",
          ];
        })
      );
    }
  }
  result.ok = true;
  return result;
}
