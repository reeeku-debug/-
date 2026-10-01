import { test } from "node:test";
import assert from "node:assert/strict";
import { concentration, scopeMetrics, talentRows } from "../../src/lib/revenue/analytics";
import { buildOverview } from "../../src/lib/revenue/dashboard";
import { generateDemoDataset } from "../../src/lib/revenue/datasource/demo";
import { evaluateKpi } from "../../src/lib/revenue/kpi";
import { buildModel } from "../../src/lib/revenue/normalize";
import { resolvePeriod } from "../../src/lib/revenue/period";
import { DEFAULT_SETTINGS, type RawDataset } from "../../src/lib/revenue/types";

const today = "2026-09-15";

function dataset(): RawDataset {
  return {
    raw: {
      IRIAM: {
        headers: ["日付", "ライバーID", "ライバー名", "報酬額(円)", "配信時間(分)"],
        rows: [
          ["2026/08/03", "A", "Aさん", "100000", "120"],
          ["2026/09/01", "A", "Aさん", "500000", "120"],
          ["2026/09/02", "B", "Bさん", "300000", "60"],
        ],
      },
      Avvy: {
        headers: ["date", "user_id", "earnings"],
        // Avvy は 1ダイヤ＝0.8円で換算されるので 250,000ダイヤ → 200,000円
        rows: [["2026-09-03", "C", "250000"]],
      },
      Mirrativ: { headers: [], rows: [] },
    },
    talents: {
      headers: ["talent_id", "タレント名", "アプリ", "登録日", "活動開始日", "ステータス"],
      rows: [
        ["A", "Aさん", "IRIAM", "2026/07/01", "2026/07/05", "配信開始"],
        ["B", "Bさん", "IRIAM", "2026/09/01", "2026/09/02", "配信開始"],
        ["C", "Cさん", "Avvy", "2026/08/20", "", "配信開始"],
        ["D", "Dさん", "Mirrativ", "2026/08/01", "", "配信準備中"],
        ["E", "Eさん", "Mirrativ", "", "", "登録前"],
      ],
    },
    kpi: {
      headers: ["年月", "アプリ", "KPI項目", "目標値"],
      rows: [["2026/09", "IRIAM", "売上", "1000000"], ["2026/09", "全体", "新規登録", "4"]],
    },
    mapping: null,
    settings: null,
    missingSheets: [],
  };
}

test("3媒体の売上・登録者数を合算する", () => {
  const model = buildModel(dataset(), today);
  const period = resolvePeriod({}, today);
  const m = scopeMetrics(model, period, "全体");
  assert.equal(m.revenue, 1000000);
  assert.equal(m.totalRegistrations, 4); // 登録前のEは含めない
  assert.equal(m.newRegistrations, 1);
  assert.equal(m.cumulativeRevenue, 1100000);
  assert.equal(m.revenuePerRegistered, 250000);
  assert.equal(m.earners, 3);
  const iriam = scopeMetrics(model, period, "IRIAM");
  assert.equal(iriam.revenue, 800000);
  assert.equal(iriam.totalRegistrations, 2);
});

test("進行中の月は前月の同じ日数と比較する", () => {
  const period = resolvePeriod({}, today);
  assert.equal(period.compareStart, "2026-08-01");
  assert.equal(period.compareEnd, "2026-08-14");
  assert.equal(period.elapsedDays, 14);
  const model = buildModel(dataset(), today);
  const m = scopeMetrics(model, period, "IRIAM");
  assert.equal(m.compareRevenue, 100000);
  assert.equal(Math.round(m.revenueChange!), 700);
});

test("KPI達成率 = 実績 ÷ 目標 × 100、不足額と着地見込みを出す", () => {
  const period = resolvePeriod({ p: "prev" }, today); // 完了した月
  const e = evaluateKpi("IRIAM", "revenue", "売上", "yen", 1000000, false, 800000, period, DEFAULT_SETTINGS);
  assert.equal(e.rate, 80);
  assert.equal(e.shortfall, 200000);
  assert.equal(e.forecast, null);
  assert.equal(e.status, "attention");

  const cur = resolvePeriod({}, today); // 14日経過 / 30日
  const f = evaluateKpi("IRIAM", "revenue", "売上", "yen", 1000000, false, 700000, cur, DEFAULT_SETTINGS);
  assert.equal(f.forecast, 1500000);
  assert.equal(f.status, "on_track");
  assert.equal(f.requiredPerDay, 300000 / 16);
});

test("売上依存度（上位1人・3人の比率）", () => {
  const model = buildModel(dataset(), today);
  const rows = talentRows(model, resolvePeriod({}, today));
  const c = concentration(rows);
  assert.equal(c.total, 1000000);
  assert.equal(c.top1, 50);
  assert.equal(c.top3, 100);
  assert.equal(c.leaders[0].talent.name, "Aさん");
});

test("要確認タレントを抽出する", () => {
  const model = buildModel(dataset(), today);
  const rows = talentRows(model, resolvePeriod({}, today));
  const d = rows.find((r) => r.talent.talentId === "D")!;
  assert.ok(d.flags.includes("no_revenue"), "登録後7日以上売上なし");
  const a = rows.find((r) => r.talent.talentId === "A")!;
  assert.deepEqual(a.flags, []);
  assert.equal(rows.find((r) => r.talent.talentId === "E"), undefined);
});

test("全体KPIが未設定の項目はアプリ別目標の合計を使う", () => {
  const model = buildModel(dataset(), today);
  const overview = buildOverview(model, resolvePeriod({}, today));
  const revenueKpi = overview.total.kpis.find((k) => k.item === "revenue")!;
  assert.equal(revenueKpi.target, 1000000);
  assert.equal(revenueKpi.targetDerived, true);
  const reg = overview.total.kpis.find((k) => k.item === "new_registrations")!;
  assert.equal(reg.target, 4);
  assert.equal(reg.targetDerived, false);
  assert.ok(overview.alerts.some((a) => a.message.includes("売上の50%が1人")));
});

test("任意期間では月次目標を日数で按分する", () => {
  const model = buildModel(dataset(), today);
  const period = resolvePeriod({ p: "custom", from: "2026-09-01", to: "2026-09-15" }, today);
  const overview = buildOverview(model, period);
  const revenueKpi = overview.apps.IRIAM.kpis.find((k) => k.item === "revenue")!;
  assert.equal(revenueKpi.target, 500000);
});

test("ダミーデータがすべて正規化でき、重複取込が除外される", () => {
  const model = buildModel(generateDemoDataset("2026-09-30"), "2026-09-30");
  assert.deepEqual(model.warnings, []);
  for (const r of model.mappingReports) {
    assert.equal(r.errors.length, 0);
    assert.equal(r.skippedRows, 0);
  }
  assert.ok(model.mappingReports[0].duplicateRows > 0);
  assert.ok(model.records.length > 1000);
});
