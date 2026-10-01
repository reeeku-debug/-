import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoDataSource } from "../../src/lib/revenue/datasource/demo";
import { mergeRowsIntoTable } from "../../src/lib/revenue/datasource/types";
import { importCsv } from "../../src/lib/revenue/import";
import { buildModel } from "../../src/lib/revenue/normalize";

const CSV = "日付,ライバーID,ライバー名,報酬額(円)\n2030/01/01,NEW1,新人A,1000\n2030/01/01,NEW2,新人B,2000\n2030/01/02,NEW1,新人A,abc\n";

test("CSV取込：新規追記 → 同じCSVの再取込は重複としてスキップ → 修正版は上書き", async () => {
  const source = createDemoDataSource("2099-01-01"); // 独立したストア
  const now = new Date("2030-01-03T00:00:00Z");

  let raw = await source.load();
  const first = await importCsv({ source, raw, appId: "IRIAM", fileName: "a.csv", text: CSV, dryRun: false, addTalents: true, now });
  assert.equal(first.ok, true);
  assert.equal(first.newRecords, 2);
  assert.equal(first.invalidRows, 1);
  assert.equal(first.appendedRows, 2);
  assert.equal(first.addedTalents, 2);

  raw = await source.load();
  const second = await importCsv({ source, raw, appId: "IRIAM", fileName: "a.csv", text: CSV, dryRun: false, addTalents: true, now });
  assert.equal(second.newRecords, 0);
  assert.equal(second.duplicateRecords, 2);
  assert.equal(second.appendedRows, 0);
  assert.equal(second.addedTalents, 0);

  raw = await source.load();
  const fixed = CSV.replace("新人B,2000", "新人B,2500");
  const third = await importCsv({
    source, raw, appId: "IRIAM", fileName: "b.csv", text: fixed, dryRun: false, addTalents: true,
    now: new Date("2030-01-03T01:00:00Z"),
  });
  assert.equal(third.updatedRecords, 1);
  assert.equal(third.duplicateRecords, 1);

  const model = buildModel(await source.load(), "2030-01-03");
  const recs = model.records.filter((r) => r.talentId.startsWith("NEW"));
  assert.deepEqual(recs.map((r) => r.revenue).sort(), [1000, 2500]);
  assert.ok(model.talents.some((t) => t.talentId === "NEW1" && !t.fromRawOnly));
});

test("プレビュー（dryRun）では書き込まない", async () => {
  const source = createDemoDataSource("2099-01-02");
  const raw = await source.load();
  const before = raw.raw.IRIAM.rows.length;
  const r = await importCsv({ source, raw, appId: "IRIAM", fileName: "a.csv", text: CSV, dryRun: true, addTalents: true });
  assert.equal(r.newRecords, 2);
  assert.equal((await source.load()).raw.IRIAM.rows.length, before);
});

test("必須列がないCSVはエラー", async () => {
  const source = createDemoDataSource("2099-01-03");
  const r = await importCsv({
    source, raw: await source.load(), appId: "IRIAM", fileName: "x.csv", text: "a,b\n1,2\n", dryRun: true, addTalents: false,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes("必須項目"));
});

test("mergeRowsIntoTable はヘッダーを統合して列を揃える", () => {
  const t = mergeRowsIntoTable({ headers: ["a", "b"], rows: [["1", "2"]] }, ["b", "c"], [["3", "4"]]);
  assert.deepEqual(t.headers, ["a", "b", "c"]);
  assert.deepEqual(t.rows, [["1", "2", ""], ["", "3", "4"]]);
});
