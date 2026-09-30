// Google Apps Script（ウェブアプリ）経由でスプレッドシートを読み書きするデータソース。
// 組織ポリシーでサービスアカウントの鍵が作れない環境向け。スクリプト本体は scripts/gas/webapp.gs。

import { APPS } from "../apps";
import type { RawDataset, RawTable } from "../types";
import { SHEET_NAMES, type RevenueDataSource } from "./types";

export interface GasConfig {
  url: string;
  token: string;
}

/**
 *   GAS_WEBAPP_URL  … Apps Script の「ウェブアプリ URL」（https://script.google.com/macros/s/…/exec）
 *   GAS_TOKEN       … スクリプトの TOKEN に設定した合言葉
 */
export function readGasConfig(env: NodeJS.ProcessEnv = process.env): GasConfig | null {
  const url = env.GAS_WEBAPP_URL?.trim();
  const token = env.GAS_TOKEN?.trim();
  if (!url || !token) return null;
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    throw new Error("GAS_WEBAPP_URL は https://script.google.com/macros/s/…/exec の形式で指定してください");
  }
  return { url, token };
}

function toTable(values: unknown[][] | undefined): RawTable {
  if (!values || values.length === 0) return { headers: [], rows: [] };
  const headers = values[0].map((v) => String(v ?? "").trim());
  const rows = values
    .slice(1)
    .map((r) => headers.map((_, i) => (r[i] === null || r[i] === undefined ? "" : String(r[i]))))
    .filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, rows };
}

export function createGasDataSource(config: GasConfig): RevenueDataSource {
  async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(config.url, {
      method: "POST",
      // Apps Script は text/plain で受け取るとプリフライト等の問題が起きにくい
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: config.token, action, ...payload }),
      redirect: "follow",
      cache: "no-store",
    });
    const text = await res.text();
    let data: { ok?: boolean; error?: string } & T;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Apps Script から想定外の応答がありました (${res.status})。デプロイの「アクセスできるユーザー」が「全員」になっているか確認してください`
      );
    }
    if (!data.ok) {
      const reason = data.error === "unauthorized" ? "合言葉（GAS_TOKEN）がスクリプトの TOKEN と一致しません" : data.error;
      throw new Error(`Apps Script エラー: ${reason}`);
    }
    return data;
  }

  return {
    kind: "gas",
    label: "Googleスプレッドシート",
    writable: true,

    async load(): Promise<RawDataset> {
      const required = [...APPS.map((a) => a.rawSheet), SHEET_NAMES.talents, SHEET_NAMES.kpi];
      const optional = [SHEET_NAMES.mapping, SHEET_NAMES.settings];
      const data = await call<{ titles: string[]; tables: Record<string, unknown[][]> }>("load", {
        sheets: [...required, ...optional],
      });
      const titles = new Set(data.titles);
      const get = (n: string) => toTable(data.tables[n]);
      return {
        raw: Object.fromEntries(APPS.map((a) => [a.id, get(a.rawSheet)])),
        talents: get(SHEET_NAMES.talents),
        kpi: get(SHEET_NAMES.kpi),
        mapping: titles.has(SHEET_NAMES.mapping) ? get(SHEET_NAMES.mapping) : null,
        settings: titles.has(SHEET_NAMES.settings) ? get(SHEET_NAMES.settings) : null,
        missingSheets: required.filter((n) => !titles.has(n)),
      };
    },

    async appendRows(sheet, headers, rows) {
      await call("append", { sheet, headers, rows });
    },

    async replaceSheet(sheet, table) {
      await call("replace", { sheet, headers: table.headers, rows: table.rows });
    },

    async ensureSheets(defs) {
      const data = await call<{ created: string[] }>("ensure", { defs });
      return data.created;
    },
  };
}
