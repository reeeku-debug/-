// Google スプレッドシートのデータソース（Google Sheets API v4 / サービスアカウント認証）。
// 認証情報はすべて環境変数から読み込む（ソースコードに記載しない）。

import { createSign } from "crypto";
import { APPS } from "../apps";
import type { RawDataset, RawTable } from "../types";
import { SHEET_NAMES, mergeRowsIntoTable, type RevenueDataSource } from "./types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export interface SheetsConfig {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * 環境変数から接続設定を読み込む。
 *   GOOGLE_SHEETS_SPREADSHEET_ID           スプレッドシートID（URLの /d/ と /edit の間）
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL           サービスアカウントのメールアドレス
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY     秘密鍵（改行は \n のままでよい）
 * または
 *   GOOGLE_SERVICE_ACCOUNT_JSON            サービスアカウントのJSONキー（そのまま or Base64）
 */
export function readSheetsConfig(env: NodeJS.ProcessEnv = process.env): SheetsConfig | null {
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) return null;
  let clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  let privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";
  const json = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const text = json.startsWith("{") ? json : Buffer.from(json, "base64").toString("utf8");
      const parsed = JSON.parse(text) as { client_email?: string; private_key?: string };
      clientEmail = parsed.client_email ?? clientEmail;
      privateKey = parsed.private_key ?? privateKey;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON を読み取れません（JSON または Base64 の JSON を指定してください）");
    }
  }
  if (!clientEmail || !privateKey) return null;
  return { spreadsheetId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

// ---- 認証（サービスアカウントの JWT → アクセストークン） ----

const tokenCache = globalThis as unknown as { revenueSheetsToken?: { token: string; expiresAt: number; email: string } };

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(config: SheetsConfig): Promise<string> {
  const cached = tokenCache.revenueSheetsToken;
  if (cached && cached.email === config.clientEmail && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: config.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(config.privateKey));
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google認証に失敗しました (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.revenueSheetsToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    email: config.clientEmail,
  };
  return data.access_token;
}

// ---- API 呼び出し ----

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
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

export function createSheetsDataSource(config: SheetsConfig): RevenueDataSource {
  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getAccessToken(config);
    const res = await fetch(`${SHEETS_API}/${encodeURIComponent(config.spreadsheetId)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Sheets API エラー (${res.status}): ${body.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  }

  async function sheetTitles(): Promise<string[]> {
    const data = await api<{ sheets?: Array<{ properties: { title: string } }> }>(
      "?fields=sheets.properties.title"
    );
    return (data.sheets ?? []).map((s) => s.properties.title);
  }

  async function readSheets(names: string[]): Promise<Map<string, RawTable>> {
    const result = new Map<string, RawTable>();
    if (names.length === 0) return result;
    const q = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
    for (const n of names) q.append("ranges", quoteSheet(n));
    const data = await api<{ valueRanges?: Array<{ values?: unknown[][] }> }>(`/values:batchGet?${q.toString()}`);
    (data.valueRanges ?? []).forEach((vr, i) => result.set(names[i], toTable(vr.values)));
    return result;
  }

  async function addSheets(names: string[]) {
    if (names.length === 0) return;
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: names.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }

  async function writeValues(sheet: string, values: string[][]) {
    await api(`/values/${encodeURIComponent(`${quoteSheet(sheet)}!A1`)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    });
  }

  return {
    kind: "sheets",
    label: "Googleスプレッドシート",
    writable: true,

    async load(): Promise<RawDataset> {
      const titles = new Set(await sheetTitles());
      const required = [...APPS.map((a) => a.rawSheet), SHEET_NAMES.talents, SHEET_NAMES.kpi];
      const optional = [SHEET_NAMES.mapping, SHEET_NAMES.settings];
      const existing = [...required, ...optional].filter((n) => titles.has(n));
      const tables = await readSheets(existing);
      const get = (n: string) => tables.get(n) ?? { headers: [], rows: [] };
      return {
        raw: Object.fromEntries(APPS.map((a) => [a.id, get(a.rawSheet)])),
        talents: get(SHEET_NAMES.talents),
        kpi: get(SHEET_NAMES.kpi),
        mapping: tables.get(SHEET_NAMES.mapping) ?? null,
        settings: tables.get(SHEET_NAMES.settings) ?? null,
        missingSheets: required.filter((n) => !titles.has(n)),
      };
    },

    async appendRows(sheet, headers, rows) {
      const titles = await sheetTitles();
      if (!titles.includes(sheet)) await addSheets([sheet]);
      const current = (await readSheets([sheet])).get(sheet) ?? { headers: [], rows: [] };
      const headerOnly = mergeRowsIntoTable({ headers: current.headers, rows: [] }, headers, rows);
      if (headerOnly.headers.length !== current.headers.length) {
        await api(`/values/${encodeURIComponent(`${quoteSheet(sheet)}!1:1`)}?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ values: [headerOnly.headers] }),
        });
      }
      if (headerOnly.rows.length === 0) return;
      await api(
        `/values/${encodeURIComponent(`${quoteSheet(sheet)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: headerOnly.rows }) }
      );
    },

    async replaceSheet(sheet, table) {
      const titles = await sheetTitles();
      if (!titles.includes(sheet)) await addSheets([sheet]);
      await api(`/values/${encodeURIComponent(quoteSheet(sheet))}:clear`, { method: "POST", body: "{}" });
      await writeValues(sheet, [table.headers, ...table.rows]);
    },

    async ensureSheets(defs) {
      const titles = new Set(await sheetTitles());
      const missing = defs.filter((d) => !titles.has(d.name));
      await addSheets(missing.map((d) => d.name));
      for (const d of missing) if (d.headers.length > 0) await writeValues(d.name, [d.headers]);
      return missing.map((d) => d.name);
    },
  };
}
