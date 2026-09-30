import { createDemoDataSource } from "./demo";
import { createSheetsDataSource, readSheetsConfig } from "./sheets";
import type { RevenueDataSource } from "./types";

/**
 * 使用するデータソースを環境変数で切り替える。
 *   REVENUE_DATA_SOURCE=sheets  … Googleスプレッドシート（接続情報が必要）
 *   REVENUE_DATA_SOURCE=demo    … ダミーデータ
 *   未指定                      … スプレッドシートの接続情報があれば sheets、なければ demo
 */
export function resolveDataSource(today: string): { source: RevenueDataSource; configError: string | null } {
  const mode = process.env.REVENUE_DATA_SOURCE?.trim().toLowerCase();
  let config = null;
  let configError: string | null = null;
  try {
    config = readSheetsConfig();
  } catch (e) {
    configError = (e as Error).message;
  }
  if (mode === "demo") return { source: createDemoDataSource(today), configError: null };
  if (config) return { source: createSheetsDataSource(config), configError: null };
  if (mode === "sheets") {
    configError =
      configError ??
      "REVENUE_DATA_SOURCE=sheets ですが、GOOGLE_SHEETS_SPREADSHEET_ID とサービスアカウントの認証情報が設定されていません";
  }
  return { source: createDemoDataSource(today), configError };
}

export type { RevenueDataSource } from "./types";
