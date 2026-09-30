// scripts/gas/webapp.gs を簡易的なスプレッドシートの模擬環境で実行し、
// ダッシュボード側のデータソース（gas.ts）と組み合わせて読み書きを確認する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
import { createGasDataSource, readGasConfig } from "../../src/lib/revenue/datasource/gas";
import { importCsv } from "../../src/lib/revenue/import";
import { buildModel } from "../../src/lib/revenue/normalize";

class FakeSheet {
  data: unknown[][] = [];
  constructor(public name: string) {}
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  clearContents() { this.data = []; }
  getRange(row: number, col: number, numRows = 1, numCols = 1) {
    const sheet = this;
    return {
      setNumberFormat() { return this; },
      getValues() {
        return Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => sheet.data[row - 1 + i]?.[col - 1 + j] ?? "")
        );
      },
      setValues(values: unknown[][]) {
        values.forEach((r, i) => {
          const target = (sheet.data[row - 1 + i] ??= []);
          r.forEach((v, j) => (target[col - 1 + j] = v));
        });
        for (let i = 0; i < sheet.data.length; i++) sheet.data[i] ??= [];
        return this;
      },
    };
  }
}

function loadWebapp(token: string) {
  const sheets: FakeSheet[] = [];
  const ss = {
    getSheets: () => sheets,
    getSheetByName: (n: string) => sheets.find((s) => s.name === n) ?? null,
    insertSheet: (n: string) => {
      const s = new FakeSheet(n);
      sheets.push(s);
      return s;
    },
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s: string) => ({ content: s, setMimeType() { return this; } }),
    },
    Session: { getScriptTimeZone: () => "Asia/Tokyo" },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) =>
        fmt === "yyyy/MM/dd" ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}` : d.toISOString(),
    },
  });
  const code = readFileSync(join(__dirname, "../../scripts/gas/webapp.gs"), "utf8").replace(
    'const TOKEN = "ここを長い合言葉に書き換える";',
    `const TOKEN = ${JSON.stringify(token)};`
  );
  vm.runInContext(code, context);
  const doPost = context.doPost as (e: unknown) => { content: string };
  return { sheets, ss, doPost };
}

function mockFetch(doPost: (e: unknown) => { content: string }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const out = doPost({ postData: { contents: String(init?.body ?? "") } });
    return new Response(out.content, { status: 200 });
  }) as typeof fetch;
  return () => (globalThis.fetch = original);
}

test("GAS接続設定の読み込み", () => {
  assert.equal(readGasConfig({} as NodeJS.ProcessEnv), null);
  const c = readGasConfig({ GAS_WEBAPP_URL: "https://script.google.com/macros/s/abc/exec", GAS_TOKEN: "t" } as unknown as NodeJS.ProcessEnv);
  assert.equal(c?.token, "t");
  assert.throws(() => readGasConfig({ GAS_WEBAPP_URL: "https://evil.example/", GAS_TOKEN: "t" } as unknown as NodeJS.ProcessEnv));
});

test("合言葉が違うと拒否される", async () => {
  const { doPost } = loadWebapp("right");
  const restore = mockFetch(doPost);
  try {
    const source = createGasDataSource({ url: "https://script.google.com/macros/s/x/exec", token: "wrong" });
    await assert.rejects(() => source.load(), /合言葉/);
  } finally {
    restore();
  }
});

test("シート作成 → CSV取込 → 再取込（重複スキップ）→ 集計まで Apps Script 経由で動く", async () => {
  const { doPost, sheets } = loadWebapp("secret");
  const restore = mockFetch(doPost);
  try {
    const source = createGasDataSource({ url: "https://script.google.com/macros/s/x/exec", token: "secret" });

    let raw = await source.load();
    assert.ok(raw.missingSheets.includes("IRIAM_RAW"));
    const created = await source.ensureSheets([
      { name: "IRIAM_RAW", headers: [] },
      { name: "TALENTS", headers: ["talent_id", "タレント名", "アプリ", "登録日", "活動開始日", "ステータス"] },
      { name: "KPI", headers: ["年月", "アプリ", "KPI項目", "目標値", "タレントID"] },
    ]);
    assert.deepEqual(created, ["IRIAM_RAW", "TALENTS", "KPI"]);

    const csv = "日付,ライバーID,ライバー名,報酬額(円)\n2026/09/01,001,A,1000\n2026/09/01,002,B,\"2,000\"\n";
    raw = await source.load();
    const first = await importCsv({ source, raw, appId: "IRIAM", fileName: "a.csv", text: csv, dryRun: false, addTalents: true });
    assert.equal(first.newRecords, 2);
    // ID の先頭0が保持される
    assert.equal(sheets.find((s) => s.name === "IRIAM_RAW")!.data[1][1], "001");

    raw = await source.load();
    const second = await importCsv({ source, raw, appId: "IRIAM", fileName: "a.csv", text: csv, dryRun: false, addTalents: true });
    assert.equal(second.duplicateRecords, 2);
    assert.equal(second.appendedRows, 0);

    await source.replaceSheet("KPI", { headers: ["年月", "アプリ", "KPI項目", "目標値"], rows: [["2026/09", "IRIAM", "売上", "5000"]] });

    const model = buildModel(await source.load(), "2026-09-15");
    assert.deepEqual(model.warnings.filter((w) => !w.includes("シートがありません")), []);
    assert.equal(model.records.reduce((s, r) => s + r.revenue, 0), 3000);
    assert.equal(model.talents.filter((t) => !t.fromRawOnly).length, 2);
    assert.equal(model.kpis[0].target, 5000);
  } finally {
    restore();
  }
});
