import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAPPINGS, resolveMappings, getMapping } from "../../src/lib/revenue/mapping";
import { normalizeKpis, normalizeRawTable, normalizeTalents } from "../../src/lib/revenue/normalize";

const iriam = getMapping(resolveMappings(null), "IRIAM");

test("RAWデータを共通フォーマットに変換する", () => {
  const { records, report } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers: ["日付", "ライバーID", "ライバー名", "配信時間(分)", "報酬額(円)"],
    rows: [
      ["2026/09/01", "001", "A", "60", "10,000"],
      ["2026/09/01", "002", "B", "", "5000"],
      ["不正な日付", "003", "C", "", "100"],
    ],
  }, iriam);
  assert.equal(records.length, 2);
  assert.deepEqual(
    { date: records[0].date, talentId: records[0].talentId, revenue: records[0].revenue, minutes: records[0].streamMinutes },
    { date: "2026-09-01", talentId: "001", revenue: 10000, minutes: 60 }
  );
  assert.equal(records[1].streamMinutes, null);
  assert.equal(report.skippedRows, 1);
  assert.match(report.sampleErrors[0], /4行目/);
});

test("同じCSVを2回取り込んでも二重計上されない（最新バッチを採用）", () => {
  const headers = ["日付", "ライバーID", "報酬額(円)", "_import_id", "_imported_at"];
  const { records, report } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers,
    rows: [
      ["2026/09/01", "001", "1000", "a", "2026-09-02T09:00:00+09:00"],
      ["2026/09/01", "001", "1000", "b", "2026-09-02T10:00:00+09:00"],
      // 修正版CSV（後から取り込まれた値で上書き）
      ["2026/09/02", "001", "500", "a", "2026-09-02T09:00:00+09:00"],
      ["2026/09/02", "001", "800", "c", "2026-09-03T00:30:00Z"],
    ],
  }, iriam);
  assert.equal(records.length, 2);
  assert.equal(records.find((r) => r.date === "2026-09-01")!.revenue, 1000);
  assert.equal(records.find((r) => r.date === "2026-09-02")!.revenue, 800);
  assert.equal(report.duplicateRows, 2);
});

test("同じバッチ内の同一キーは合算する（1日に複数配信のCSV）", () => {
  const { records } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers: ["日付", "ライバーID", "報酬額(円)", "配信時間(分)"],
    rows: [
      ["2026/09/01", "001", "1000", "30"],
      ["2026/09/01", "001", "2000", "45"],
    ],
  }, iriam);
  assert.equal(records.length, 1);
  assert.equal(records[0].revenue, 3000);
  assert.equal(records[0].streamMinutes, 75);
});

test("record_id があればキーに含めて別レコードとして扱う", () => {
  const m = getMapping(resolveMappings({
    headers: ["アプリ", "項目", "値"],
    rows: [["IRIAM", "record_id", "枠ID"]],
  }), "IRIAM");
  const { records } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers: ["日付", "ライバーID", "報酬額(円)", "枠ID"],
    rows: [
      ["2026/09/01", "001", "1000", "x1"],
      ["2026/09/01", "001", "2000", "x2"],
      ["2026/09/01", "001", "2000", "x2"],
    ],
  }, m);
  assert.equal(records.length, 2);
});

test("MAPPINGシートで列名・換算係数・時間単位を上書きできる", () => {
  const m = getMapping(resolveMappings({
    headers: ["アプリ", "項目", "値"],
    rows: [
      ["iriam", "revenue", "獲得ポイント"],
      ["IRIAM", "revenue_multiplier", "0.5"],
      ["IRIAM", "stream_minutes", "配信秒数"],
      ["IRIAM", "stream_duration_unit", "seconds"],
    ],
  }), "IRIAM");
  const { records, report } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers: ["日付", "ライバーID", "獲得ポイント", "配信秒数"],
    rows: [["2026/09/01", "001", "3000", "3600"]],
  }, m);
  assert.equal(records[0].revenue, 1500);
  assert.equal(records[0].streamMinutes, 60);
  assert.equal(report.fields.find((f) => f.field === "revenue")!.matchedColumn, "獲得ポイント");
  // デフォルト定義は変更されない
  assert.equal(DEFAULT_MAPPINGS.IRIAM.revenueMultiplier, 1);
});

test("CSVの列名が途中で変わっても新旧両方の列から値を拾う", () => {
  const { records } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers: ["日付", "ライバーID", "報酬額(円)", "収益"],
    rows: [
      ["2026/09/01", "001", "1000", ""],
      ["2026/09/02", "001", "", "2000"],
    ],
  }, iriam);
  assert.deepEqual(records.map((r) => r.revenue), [1000, 2000]);
});

test("必須列がない場合はエラーを報告する", () => {
  const { records, report } = normalizeRawTable("IRIAM", "IRIAM_RAW", {
    headers: ["日付", "名前"],
    rows: [["2026/09/01", "A"]],
  }, iriam);
  assert.equal(records.length, 0);
  assert.match(report.errors[0], /タレントID/);
});

test("TALENTSとRAWのタレントを統合する", () => {
  const warnings: string[] = [];
  const talents = normalizeTalents(
    {
      headers: ["talent_id", "タレント名", "アプリ", "登録日", "活動開始日", "ステータス"],
      rows: [["001", "A", "iriam", "2026/08/01", "", "登録済"]],
    },
    [{ date: "2026-09-01", app: "IRIAM", talentId: "999", talentName: "Z", revenue: 1, recordId: null, streamMinutes: null, streamCount: null, key: "k" }],
    warnings
  );
  assert.equal(talents.length, 2);
  assert.equal(talents[0].app, "IRIAM");
  assert.equal(talents[0].registeredAt, "2026-08-01");
  assert.equal(talents[1].fromRawOnly, true);
  assert.equal(warnings.length, 1);
});

test("KPIシートの項目名を定義にマッピングし、未知の項目も保持する", () => {
  const kpis = normalizeKpis(
    {
      headers: ["年月", "アプリ", "KPI項目", "目標値"],
      rows: [
        ["2026/09", "IRIAM", "売上", "1,000,000"],
        ["2026/09", "全体", "稼働人数", "30"],
        ["2026/09", "Avvy", "イベント参加数", "5"],
      ],
    },
    []
  );
  assert.deepEqual(kpis.map((k) => [k.app, k.item, k.target]), [
    ["IRIAM", "revenue", 1000000],
    ["全体", "streamers", 30],
    ["Avvy", "custom:イベント参加数", 5],
  ]);
});
