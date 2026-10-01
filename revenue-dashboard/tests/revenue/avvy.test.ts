// Avvy の実際の出力CSV（タレント×月の累計スナップショット、収益はダイヤ）の形式で取込を確認する。
// ※ 値は架空のもの
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoDataSource } from "../../src/lib/revenue/datasource/demo";
import { importCsv } from "../../src/lib/revenue/import";
import { buildModel, normalizeRawTable } from "../../src/lib/revenue/normalize";
import { getMapping, resolveMappings } from "../../src/lib/revenue/mapping";
import { resolvePeriod } from "../../src/lib/revenue/period";
import { talentRows } from "../../src/lib/revenue/analytics";

const HEADER =
  "target_month,snapshot_date,user_id,account_name,agency_name,registration_type,lane,membership_status,agency_joined_date,first_stream_date,first_stream_month,cumulative_stream_days,followers,diamonds,cheer_points,gifters,stream_hours,valid_stream_hours,stream_count,stream_days";
const CSV = [
  HEADER,
  // スプレッドシートの 0 が日付表示になった行（1899/12/30）
  "2026-07,2026/09/11,aaa1,テストA,事務所,Scout (New),,Pre-join,2026/08/28,2026/09/02,2026/09/01,1899/12/30,1899/12/30,1899/12/30,1899/12/30,1899/12/30,1899/12/30,1899/12/30,1899/12/30,1899/12/30",
  "2026-08,2026/09/15,aaa1,テストA,事務所,Scout (New),,Active (Join Month),2026/08/28,2026/09/02,2026/09/01,0,3,0,0,0,0,0,0,0",
  // 同じ月の月途中スナップショットと月末スナップショット → 新しい方だけを使う
  "2026-09,2026/09/15,aaa1,テストA,事務所,Scout (New),,Active,2026/08/28,2026/09/02,2026/09/01,14,120,9000,80000,20,70,65,70,14",
  "2026-09,2026/10/01,aaa1,テストA🔰,事務所,Scout (New),,Active,2026/08/28,2026/09/02,2026/09/01,29,237,18946,160007,43,155.1,143.9,149,29",
  "2026-09,2026/10/01,bbb2,テストB,事務所,Scout (New),,Active (Join Month),2026/09/25,2026/09/26,2026/09/01,2,59,7,23,4,5,5,2,2",
  "2026-09,2026/10/01,ccc3,テストC,事務所,Scout (New),,Active (Join Month),2026/09/17,,,0,0,0,0,0,0,0,0,0",
].join("\n");

test("Avvy の月次CSVを共通フォーマットに変換する", () => {
  const lines = CSV.split("\n").map((l) => l.split(","));
  const { records, report, talentInfos } = normalizeRawTable(
    "Avvy",
    "AVVY_RAW",
    { headers: lines[0], rows: lines.slice(1) },
    getMapping(resolveMappings(null), "Avvy")
  );
  assert.deepEqual(report.errors, []);
  assert.equal(report.skippedRows, 0, "1899/12/30 の行も 0 として読める");
  const sep = records.filter((r) => r.date === "2026-09-01");
  const a = sep.find((r) => r.talentId === "aaa1")!;
  assert.equal(a.revenue, 18946, "同じ月は出力日が新しい行を採用");
  assert.equal(a.streamDays, 29);
  assert.equal(Math.round(a.streamMinutes!), 155.1 * 60);
  assert.equal(a.streamCount, 149);
  assert.equal(report.duplicateRows, 1);

  const infoA = talentInfos.find((i) => i.talentId === "aaa1")!;
  assert.equal(infoA.registeredAt, "2026-08-28");
  assert.equal(infoA.activityStartAt, "2026-09-02");
  assert.equal(infoA.status, "配信開始");
  assert.equal(infoA.name, "テストA🔰");
  const infoC = talentInfos.find((i) => i.talentId === "ccc3")!;
  assert.equal(infoC.status, "登録済", "初配信日がなければ登録済");
});

test("Avvy の月次CSVを取り込むと TALENTS に登録日が入り、集計・アラートに使われる", async () => {
  const source = createDemoDataSource("2099-02-01");
  // デモの TALENTS / RAW を空にして実データだけで確認する
  await source.replaceSheet("AVVY_RAW", { headers: [], rows: [] });
  await source.replaceSheet("TALENTS", { headers: ["talent_id", "タレント名", "アプリ", "登録日", "活動開始日", "ステータス"], rows: [] });
  await source.replaceSheet("MAPPING", { headers: ["アプリ", "項目", "値"], rows: [["Avvy", "revenue_multiplier", "0.5"]] });

  const raw = await source.load();
  const r = await importCsv({ source, raw, appId: "Avvy", fileName: "avvy.csv", text: CSV, dryRun: false, addTalents: true });
  assert.equal(r.ok, true);
  assert.equal(r.addedTalents, 3);

  const loaded = await source.load();
  const talentsSheet = loaded.talents.rows;
  const a = talentsSheet.find((row) => row[0] === "aaa1")!;
  assert.deepEqual(a.slice(2), ["Avvy", "2026/08/28", "2026/09/02", "配信開始"]);

  const today = "2026-10-01";
  const model = buildModel(loaded, today);
  const period = resolvePeriod({ p: "prev" }, today); // 2026年9月
  const rows = talentRows(model, period, "Avvy");
  const ra = rows.find((x) => x.talent.talentId === "aaa1")!;
  assert.equal(ra.revenue, Math.round(18946 * 0.5), "ダイヤ→円の換算係数を反映");
  assert.equal(ra.streamDays, 29);
  const rc = rows.find((x) => x.talent.talentId === "ccc3")!;
  assert.ok(rc.flags.includes("no_revenue"), "登録後7日以上売上なし");
});
