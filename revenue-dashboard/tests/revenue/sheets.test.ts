import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "crypto";
import { createSheetsDataSource, readSheetsConfig } from "../../src/lib/revenue/datasource/sheets";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

type Call = { url: string; method: string; body: unknown };

function mockFetch(sheets: Record<string, unknown[][]>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ url, method, body });
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.includes("?fields=sheets.properties.title")) {
      return json({ sheets: Object.keys(sheets).map((title) => ({ properties: { title } })) });
    }
    if (url.includes("/values:batchGet")) {
      const ranges = new URL(url).searchParams.getAll("ranges").map((r) => r.replace(/^'|'$/g, ""));
      return json({ valueRanges: ranges.map((r) => ({ values: sheets[r] ?? [] })) });
    }
    return json({});
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("環境変数から接続設定を読み込む（JSONキー / 個別指定）", () => {
  assert.equal(readSheetsConfig({} as NodeJS.ProcessEnv), null);
  const c = readSheetsConfig({
    GOOGLE_SHEETS_SPREADSHEET_ID: "sid",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b.iam.gserviceaccount.com",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN-----\\nabc\\n-----END-----",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(c?.privateKey, "-----BEGIN-----\nabc\n-----END-----");
  const json = Buffer.from(JSON.stringify({ client_email: "x@y", private_key: "k" })).toString("base64");
  const c2 = readSheetsConfig({ GOOGLE_SHEETS_SPREADSHEET_ID: "sid", GOOGLE_SERVICE_ACCOUNT_JSON: json } as unknown as NodeJS.ProcessEnv);
  assert.equal(c2?.clientEmail, "x@y");
});

test("シートを読み込み、存在しないシートを報告する", async () => {
  const mock = mockFetch({
    IRIAM_RAW: [["日付", "ライバーID", "報酬額(円)"], ["2026/09/01", 1, 1000]],
    TALENTS: [["talent_id", "タレント名", "アプリ"]],
  });
  try {
    const source = createSheetsDataSource({ spreadsheetId: "sid", clientEmail: "sa@test", privateKey: pem });
    const raw = await source.load();
    assert.deepEqual(raw.raw.IRIAM.rows, [["2026/09/01", "1", "1000"]]);
    assert.deepEqual(raw.missingSheets.sort(), ["AVVY_RAW", "KPI", "MIRRATIV_RAW"]);
    assert.equal(raw.mapping, null);
    const tokenCall = mock.calls[0];
    assert.match(String(tokenCall.url), /oauth2/);
    const auth = mock.calls.find((c) => c.url.includes("batchGet"));
    assert.ok(auth);
  } finally {
    mock.restore();
  }
});

test("追記時は新しい列をヘッダーに足してから行を揃えて append する", async () => {
  const mock = mockFetch({ IRIAM_RAW: [["日付", "ライバーID", "報酬額(円)"]] });
  try {
    const source = createSheetsDataSource({ spreadsheetId: "sid", clientEmail: "sa@test", privateKey: pem });
    await source.appendRows("IRIAM_RAW", ["ライバーID", "日付", "報酬額(円)", "_import_id"], [["A", "2026/09/01", "500", "b1"]]);
    const headerPut = mock.calls.find((c) => c.method === "PUT");
    assert.deepEqual((headerPut!.body as { values: string[][] }).values, [["日付", "ライバーID", "報酬額(円)", "_import_id"]]);
    const append = mock.calls.find((c) => c.url.includes(":append"));
    assert.ok(append!.url.includes("valueInputOption=RAW"));
    assert.deepEqual((append!.body as { values: string[][] }).values, [["2026/09/01", "A", "500", "b1"]]);
  } finally {
    mock.restore();
  }
});
