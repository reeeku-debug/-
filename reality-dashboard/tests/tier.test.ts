import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthView } from "../src/lib/reality/data";
import type { RealityData } from "../src/lib/reality/gas";
import { DEFAULT_CRITERIA, buildIndex, judgeMonth, type MonthlyRow } from "../src/lib/reality/tier";
import { parseRealityCsv, periodFromName, periodOfMonth } from "../src/lib/reality/csv";

const row = (m: number, id: string, hours: number, gift: number, events: number, debut = ""): MonthlyRow =>
  [m, id, id, "A", 1, hours, 0, gift, 0, events, debut];

test("T1〜T5・未評価の判定（ティア判定シートと同じ優先順位）", () => {
  const rows = [
    row(202606, "t1", 80, 500000, 5, "2025/01/01"), row(202607, "t1", 80, 500000, 5), row(202608, "t1", 80, 500000, 5),
    row(202608, "t2", 60, 900000, 5, "2025/01/01"),
    row(202608, "t3r", 10, 100000, 0, "2025/01/01"),
    row(202607, "t4", 60, 1000, 5, "2026/07/10"), row(202608, "t4", 10, 1000, 0),
    row(202608, "t5", 10, 1000, 0, "2025/01/01"),
    row(202608, "u", 1, 0, 0, "2026/09/20"),
  ];
  const res = judgeMonth(buildIndex(rows), 202608, DEFAULT_CRITERIA);
  assert.deepEqual(Object.fromEntries(res.map((x) => [x.id, x.tier])), { t1: "T1", t2: "T2", t3r: "T3", t4: "T4", t5: "T5", u: "未評価" });
  assert.match(res.find((x) => x.id === "t4")!.next, /期限：2026年9月/);
  const off = judgeMonth(buildIndex(rows), 202608, { ...DEFAULT_CRITERIA, rescue: false });
  assert.equal(off.find((x) => x.id === "t3r")!.tier, "T5");
});

test("11月デビューは翌年1月までを「デビュー3ヶ月以内」として数える", () => {
  const rows = [row(202511, "n", 70, 1000, 5, "2025/11/06"), row(202512, "n", 70, 1000, 5), row(202601, "n", 70, 150000, 5)];
  const [x] = judgeMonth(buildIndex(rows), 202601, { ...DEFAULT_CRITERIA, rescue: false });
  assert.equal(x.tier, "T3");
  assert.equal(x.reason, "デビュー3ヶ月以内に月10万達成");
});

test("画面用データ：前月との比較・担当者・既定の表示月", () => {
  const data: RealityData = {
    months: [row(202607, "a", 70, 100000, 5, "2026/07/01"), row(202608, "a", 70, 600000, 5), row(202608, "b", 1, 0, 0, "2026/08/02"), row(202610, "a", 1, 0, 0)],
    periods: { "202610": "2026/10/15" },
    talents: [["a", "a", "井上", "メモ"]],
    criteria: { ...DEFAULT_CRITERIA, evalMonth: null },
    log: [],
    spreadsheetUrl: "",
  };
  const v = buildMonthView(data, null, new Date(2026, 9, 15))!;
  assert.equal(v.month, 202608); // 途中の10月ではなく確定している最新月
  assert.deepEqual(v.tabs.map((t) => [t.month, t.partial]), [[202610, true], [202608, false], [202607, false]]);
  const a = v.list.find((x) => x.id === "a")!;
  assert.equal(a.prevTier, "T3");
  assert.equal(a.tier, "T3"); // 3ヶ月平均 (60万+10万+0)/3 ≒ 23万 → T2 に届かず、デビュー3ヶ月以内に10万達成で T3
  assert.equal(a.change, "維持");
  assert.equal(a.owner, "井上");
  assert.equal(v.list.find((x) => x.id === "b")!.change, "新規");
  assert.equal(buildMonthView(data, 202610, new Date(2026, 9, 15))!.tabs[0].through, "2026/10/15");
});

test("実際のREALITY配信レポートCSVの列名を読み取れる", () => {
  const csv =
    "配信者名,ID,ランク,合計配信回数,合計配信時間（時）,合計視聴者数,合計被視聴時間（時）,合計ギフト金額,合計獲得スコア,参加中のイベント,初配信日,デビュー条件,トップ到達,今月のスコアボーナス金額\n" +
    'みるね,a1,A,12,30.5,100,200.5,"166,595.89",9999,"夏祭り\n秋イベ",2025/06/14,済,,0\n';
  assert.deepEqual(parseRealityCsv(csv), [{ id: "a1", name: "みるね", hours: 30.5, gift: 166595.89, events: 2 }]);
  assert.throws(() => parseRealityCsv("名前,売上\nx,1"), /列が見つかりません/);
});

test("ファイル名・月から期間を決める", () => {
  assert.deepEqual(periodFromName("streamer_20261001_20261015.csv"), { start: "2026/10/01", end: "2026/10/15", month: 202610 });
  assert.equal(periodFromName("data.csv"), null);
  assert.deepEqual(periodOfMonth(202602), { start: "2026/02/01", end: "2026/02/28", month: 202602 });
});
