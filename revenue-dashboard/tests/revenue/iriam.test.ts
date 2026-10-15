// IRIAM の配信レポートCSV（集計期間ごとのタレント別集計）の形式で取込を確認する。
// ※ 値・ID・名前は架空のもの
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../../src/lib/revenue/csv";
import { normalizeRawTable } from "../../src/lib/revenue/normalize";
import { durationUnitForHeader, getMapping, resolveMappings } from "../../src/lib/revenue/mapping";

const HEADER =
  "集計開始日,集計終了日,アカウント名,User ID,オーガナイザー名,オーガナイザー登録日,初回配信日時,応援ポイント,獲得ポイント,配信回数,配信日数,総配信時間,平均視聴数,課金者数,総コメント数,平均コメント数,30分あたりの平均コメント数,バッジ数,ランク,時間ダイヤ,時間ダイヤが獲得できた配信時間,応援ダイヤ,レーベル名";
const CSV = [
  HEADER,
  // 月途中のレポートと月末のレポート（同じ集計開始日）→ 集計終了日が新しい方を採用
  "2026-09-01,2026-09-15,テストA,aaaa-1111,事務所,2026-07-01,2026-06-04 21:51:34,20000,5000,14,13,12.50,4.6,8,2000,150,100,2,C2,100,1.5,700,事務所",
  "2026-09-01,2026-09-30,テストA,aaaa-1111,事務所,2026-07-01,2026-06-04 21:51:34,50837,12088,28,27,25.44,4.64,11,5416,193.43,111.06,4,C2,200,3.0,1586,事務所",
  '2026-09-01,2026-09-30," テストB ",bbbb-2222,事務所,2026-09-13,2026-09-14 01:50:07,653,10,1,1,1.09,7.00,1,125,125.00,57.32,0,D,0,0.00,24,事務所',
  "2026-09-01,2026-09-30,テストC,cccc-3333,事務所,2026-03-26,未配信,0,0,0,0,0.00,0,0,0,0,0,0,ランクなし,0,0.0,0,事務所",
  "",
].join("\n");

test("IRIAM の配信レポートを共通フォーマットに変換する", () => {
  const csv = parseCsv(CSV);
  const { records, report, talentInfos } = normalizeRawTable("IRIAM", "IRIAM_RAW", csv, getMapping(resolveMappings(null), "IRIAM"));
  assert.deepEqual(report.errors, []);
  assert.equal(report.skippedRows, 0);
  assert.equal(report.fields.find((f) => f.field === "revenue")!.matchedColumn, "時間ダイヤ+応援ダイヤ");

  const a = records.find((r) => r.talentId === "aaaa-1111")!;
  assert.equal(a.date, "2026-09-01");
  assert.equal(a.revenue, 200 + 1586, "時間ダイヤ＋応援ダイヤ（1ダイヤ＝1円）、集計終了日が新しい行");
  assert.equal(a.streamDays, 27);
  assert.equal(a.streamCount, 28);
  assert.equal(Math.round(a.streamMinutes!), Math.round(25.44 * 60), "総配信時間は時間単位");
  assert.equal(report.duplicateRows, 1);

  const b = records.find((r) => r.talentId === "bbbb-2222")!;
  assert.equal(b.talentName, "テストB");
  assert.equal(b.revenue, 24);

  const infoA = talentInfos.find((i) => i.talentId === "aaaa-1111")!;
  assert.equal(infoA.registeredAt, "2026-07-01");
  assert.equal(infoA.activityStartAt, "2026-06-04");
  const infoC = talentInfos.find((i) => i.talentId === "cccc-3333")!;
  assert.equal(infoC.activityStartAt, null, "「未配信」は初配信日なし");
});

test("配信時間の単位は列名から推定する", () => {
  assert.equal(durationUnitForHeader("配信時間(分)", "hours"), "minutes");
  assert.equal(durationUnitForHeader("stream_seconds", "hours"), "seconds");
  assert.equal(durationUnitForHeader("stream_hours", "minutes"), "hours");
  assert.equal(durationUnitForHeader("総配信時間", "hours"), "hours");
});
