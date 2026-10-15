// データ取得のエントリーポイント（キャッシュ付き）。画面・APIはここを経由してデータを読む。

import { resolveDataSource } from "./datasource";
import type { RevenueDataSource } from "./datasource/types";
import { buildModel } from "./normalize";
import { todayJst } from "./parse";
import type { RawDataset, RevenueModel } from "./types";

export interface LoadedRevenueData {
  model: RevenueModel;
  raw: RawDataset;
  source: { kind: RevenueDataSource["kind"]; label: string; writable: boolean };
  /** データソースから読み込んだ日時（ISO） */
  loadedAt: string;
  /** 読み込み失敗・設定不備のメッセージ */
  error: string | null;
}

const CACHE_TTL_MS = Math.max(0, Number(process.env.REVENUE_CACHE_TTL_SECONDS ?? 60)) * 1000;

const globalCache = globalThis as unknown as {
  revenueDataCache?: { data: LoadedRevenueData; expiresAt: number; today: string };
};

const EMPTY_RAW: RawDataset = {
  raw: {},
  talents: { headers: [], rows: [] },
  kpi: { headers: [], rows: [] },
  mapping: null,
  settings: null,
  missingSheets: [],
};

export function getRevenueDataSource(): { source: RevenueDataSource; configError: string | null } {
  return resolveDataSource(todayJst());
}

export async function loadRevenueData(options: { fresh?: boolean } = {}): Promise<LoadedRevenueData> {
  const today = todayJst();
  const cached = globalCache.revenueDataCache;
  if (!options.fresh && cached && cached.today === today && cached.expiresAt > Date.now()) return cached.data;

  const { source, configError } = resolveDataSource(today);
  const loadedAt = new Date().toISOString();
  let raw = EMPTY_RAW;
  let error = configError;
  try {
    raw = await source.load();
  } catch (e) {
    error = `データの読み込みに失敗しました: ${(e as Error).message}`;
  }
  const data: LoadedRevenueData = {
    model: buildModel(raw, today),
    raw,
    source: { kind: source.kind, label: source.label, writable: source.writable },
    loadedAt,
    error,
  };
  // 失敗時はキャッシュしない（次のアクセスで再試行する）
  if (!error || source.kind === "demo") {
    globalCache.revenueDataCache = { data, expiresAt: Date.now() + CACHE_TTL_MS, today };
  }
  return data;
}

export function invalidateRevenueCache() {
  globalCache.revenueDataCache = undefined;
}
