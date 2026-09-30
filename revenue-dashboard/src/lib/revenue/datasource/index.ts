import { createDemoDataSource } from "./demo";
import { createGasDataSource, readGasConfig } from "./gas";
import { createSheetsDataSource, readSheetsConfig } from "./sheets";
import type { RevenueDataSource } from "./types";

/**
 * 使用するデータソースを環境変数で切り替える。
 *   REVENUE_DATA_SOURCE=gas     … Apps Script（ウェブアプリ）経由でスプレッドシート（GAS_WEBAPP_URL / GAS_TOKEN）
 *   REVENUE_DATA_SOURCE=sheets  … Google Sheets API（サービスアカウントの鍵が必要）
 *   REVENUE_DATA_SOURCE=demo    … ダミーデータ
 *   未指定                      … gas → sheets の順に接続情報がある方、どちらもなければ demo
 */
export function resolveDataSource(today: string): { source: RevenueDataSource; configError: string | null } {
  const mode = process.env.REVENUE_DATA_SOURCE?.trim().toLowerCase();
  if (mode === "demo") return { source: createDemoDataSource(today), configError: null };

  const errors: string[] = [];
  const read = <T>(fn: () => T | null): T | null => {
    try {
      return fn();
    } catch (e) {
      errors.push((e as Error).message);
      return null;
    }
  };
  const gas = mode === "sheets" ? null : read(readGasConfig);
  const sheets = mode === "gas" ? null : read(readSheetsConfig);

  if (gas) return { source: createGasDataSource(gas), configError: null };
  if (sheets) return { source: createSheetsDataSource(sheets), configError: null };
  if (mode === "gas") errors.push("REVENUE_DATA_SOURCE=gas ですが、GAS_WEBAPP_URL と GAS_TOKEN が設定されていません");
  if (mode === "sheets") {
    errors.push("REVENUE_DATA_SOURCE=sheets ですが、GOOGLE_SHEETS_SPREADSHEET_ID とサービスアカウントの認証情報が設定されていません");
  }
  return { source: createDemoDataSource(today), configError: errors.length > 0 ? errors.join(" / ") : null };
}

export type { RevenueDataSource } from "./types";
