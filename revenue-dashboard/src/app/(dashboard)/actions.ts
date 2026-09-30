"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { APPS, ALL_APPS_ID } from "@/lib/revenue/apps";
import { decodeCsvBuffer } from "@/lib/revenue/csv";
import {
  KPI_HEADERS,
  MAPPING_HEADERS,
  SETTINGS_HEADERS,
  SHEET_NAMES,
  TALENTS_HEADERS,
} from "@/lib/revenue/datasource/types";
import { importCsv, type ImportResult } from "@/lib/revenue/import";
import { kpiDefinitionByKey } from "@/lib/revenue/kpi-definitions";
import { normalizeKpis } from "@/lib/revenue/normalize";
import { parseMonth, parseNumber } from "@/lib/revenue/parse";
import { getRevenueDataSource, invalidateRevenueCache, loadRevenueData } from "@/lib/revenue/service";
import { DEFAULT_SETTINGS, type RevenueSettings } from "@/lib/revenue/types";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function done() {
  invalidateRevenueCache();
  revalidatePath("/", "layout");
}

/** データを再読み込み（キャッシュを破棄） */
export async function refreshRevenueData() {
  await requireSession();
  done();
}

export type ImportState = { result: ImportResult | null; error: string | null };

export async function importCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireSession();
  const file = formData.get("file");
  const appId = String(formData.get("app") ?? "");
  const encoding = String(formData.get("encoding") ?? "auto");
  const dryRun = formData.get("dryRun") === "on";
  const addTalents = formData.get("addTalents") === "on";
  if (!(file instanceof File) || file.size === 0) return { result: null, error: "CSVファイルを選択してください" };
  if (file.size > MAX_UPLOAD_BYTES) return { result: null, error: "ファイルサイズが大きすぎます（10MBまで）" };

  let text: string;
  try {
    text = decodeCsvBuffer(await file.arrayBuffer(), encoding);
  } catch {
    return { result: null, error: "ファイルの文字コードを判別できませんでした" };
  }
  const { source, configError } = getRevenueDataSource();
  if (configError) return { result: null, error: configError };
  try {
    const { raw } = await loadRevenueData({ fresh: true });
    const result = await importCsv({ source, raw, appId, fileName: file.name, text, dryRun, addTalents });
    if (!dryRun && result.ok) done();
    return { result, error: null };
  } catch (e) {
    return { result: null, error: `取り込みに失敗しました: ${(e as Error).message}` };
  }
}

export type SaveState = { ok: boolean; message: string | null };

/** 指定月のKPI（アプリ別・全体）を保存。タレント個別KPIなど他の行はそのまま残す */
export async function saveKpisAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireSession();
  const month = parseMonth(formData.get("month"));
  if (!month) return { ok: false, message: "年月が不正です" };

  const scopes = [...APPS.map((a) => a.id), ALL_APPS_ID];
  const edited = new Map<string, number | null>();
  for (const [name, value] of Array.from(formData.entries())) {
    const m = name.match(/^kpi__(.+?)__(.+)$/);
    if (!m) continue;
    // フォーム項目名はASCIIに限定（全体 = ALL）
    const scope = m[1] === "ALL" ? ALL_APPS_ID : m[1];
    const item = m[2];
    if (!scopes.includes(scope) || !kpiDefinitionByKey(item)) continue;
    const text = String(value).trim();
    const n = text === "" ? null : parseNumber(text);
    if (text !== "" && (n === null || n < 0)) {
      return { ok: false, message: `${scope} / ${kpiDefinitionByKey(item)!.label} の値が不正です` };
    }
    edited.set(`${scope}|${item}`, n);
  }

  try {
    const { raw } = await loadRevenueData({ fresh: true });
    const { source, configError } = getRevenueDataSource();
    if (configError) return { ok: false, message: configError };
    const kept = normalizeKpis(raw.kpi, []).filter(
      (k) => !(k.month === month && !k.talentId && edited.has(`${k.app}|${k.item}`))
    );
    const rows = kept.map((k) => [
      k.month.replace("-", "/"),
      k.app,
      k.itemLabel,
      String(k.target),
      k.talentId ?? "",
    ]);
    edited.forEach((target, key) => {
      if (target === null) return;
      const [scope, item] = key.split("|");
      rows.push([month.replace("-", "/"), scope, kpiDefinitionByKey(item)!.label, String(target), ""]);
    });
    rows.sort((a, b) => (a[0] + a[1] + a[4]).localeCompare(b[0] + b[1] + b[4]));
    await source.replaceSheet(SHEET_NAMES.kpi, { headers: KPI_HEADERS, rows });
    done();
    return { ok: true, message: `${month.replace("-", "年")}月のKPIを保存しました` };
  } catch (e) {
    return { ok: false, message: `保存に失敗しました: ${(e as Error).message}` };
  }
}

/** タレント個別の売上KPIを保存 */
export async function saveTalentKpiAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireSession();
  const month = parseMonth(formData.get("month"));
  const app = String(formData.get("app") ?? "");
  const talentId = String(formData.get("talentId") ?? "").trim();
  const text = String(formData.get("target") ?? "").trim();
  const target = text === "" ? null : parseNumber(text);
  if (!month || !talentId || !APPS.some((a) => a.id === app)) return { ok: false, message: "入力が不正です" };
  if (text !== "" && (target === null || target < 0)) return { ok: false, message: "目標値が不正です" };
  try {
    const { raw } = await loadRevenueData({ fresh: true });
    const { source, configError } = getRevenueDataSource();
    if (configError) return { ok: false, message: configError };
    const kept = normalizeKpis(raw.kpi, []).filter(
      (k) => !(k.month === month && k.app === app && k.item === "talent_revenue" && k.talentId === talentId)
    );
    const rows = kept.map((k) => [k.month.replace("-", "/"), k.app, k.itemLabel, String(k.target), k.talentId ?? ""]);
    if (target !== null) rows.push([month.replace("-", "/"), app, "タレント売上", String(target), talentId]);
    await source.replaceSheet(SHEET_NAMES.kpi, { headers: KPI_HEADERS, rows });
    done();
    return { ok: true, message: target === null ? "個別KPIを削除しました（アプリ共通の目標を使用）" : "個別KPIを保存しました" };
  } catch (e) {
    return { ok: false, message: `保存に失敗しました: ${(e as Error).message}` };
  }
}

export async function saveSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireSession();
  const rows: string[][] = [];
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof RevenueSettings>) {
    const n = parseNumber(formData.get(key));
    if (n === null || n < 0) return { ok: false, message: `${key} の値が不正です` };
    rows.push([key, String(n)]);
  }
  try {
    const { source, configError } = getRevenueDataSource();
    if (configError) return { ok: false, message: configError };
    await source.replaceSheet(SHEET_NAMES.settings, { headers: SETTINGS_HEADERS, rows });
    done();
    return { ok: true, message: "アラート設定を保存しました" };
  } catch (e) {
    return { ok: false, message: `保存に失敗しました: ${(e as Error).message}` };
  }
}

/** スプレッドシートに不足しているシートを作成（ヘッダー行付き） */
export async function initSheetsAction(_prev: SaveState): Promise<SaveState> {
  await requireSession();
  const { source, configError } = getRevenueDataSource();
  if (configError) return { ok: false, message: configError };
  if (source.kind !== "sheets") return { ok: false, message: "デモモードではシートの作成は不要です" };
  try {
    const created = await source.ensureSheets([
      ...APPS.map((a) => ({ name: a.rawSheet, headers: [] as string[] })),
      { name: SHEET_NAMES.talents, headers: TALENTS_HEADERS },
      { name: SHEET_NAMES.kpi, headers: KPI_HEADERS },
      { name: SHEET_NAMES.mapping, headers: MAPPING_HEADERS },
      { name: SHEET_NAMES.settings, headers: SETTINGS_HEADERS },
    ]);
    done();
    return {
      ok: true,
      message: created.length > 0 ? `作成しました: ${created.join("、")}` : "必要なシートはすべて存在します",
    };
  } catch (e) {
    return { ok: false, message: `シートの作成に失敗しました: ${(e as Error).message}` };
  }
}
