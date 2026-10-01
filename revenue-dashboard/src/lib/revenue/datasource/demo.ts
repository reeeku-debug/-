// ダミーデータのデータソース。
// Googleスプレッドシート未接続でも画面を確認できるよう、各アプリの
// 「CSVそのまま」の形式（アプリごとにカラム名・日付形式が異なる）でRAWデータを生成する。
// 書き込みはメモリ上のみ（サーバー再起動でリセット）。

import { APPS } from "../apps";
import { addDays, addMonths, monthOf, monthStart, parseDate } from "../parse";
import type { RawDataset, RawTable } from "../types";
import { IMPORT_ID_COLUMN, IMPORTED_AT_COLUMN } from "../normalize";
import {
  KPI_HEADERS,
  SETTINGS_HEADERS,
  SHEET_NAMES,
  TALENTS_HEADERS,
  mergeRowsIntoTable,
  type RevenueDataSource,
} from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAMILY = ["星宮", "月城", "天音", "桜庭", "白雪", "夜空", "七瀬", "花咲", "水瀬", "朝比奈", "雪代", "紅葉", "綾瀬", "神楽", "音無"];
const GIVEN = ["ひな", "みお", "ゆず", "るな", "さくら", "あおい", "ねね", "りん", "こはる", "しずく", "ましろ", "つむぎ", "ここな", "ほのか", "えま", "かのん", "のあ", "もも", "あかり", "すず"];

interface DemoTalent {
  app: "IRIAM" | "Avvy" | "Mirrativ";
  id: string;
  name: string;
  registeredAt: string;
  activityStartAt: string | null;
  status: string;
  /** 1配信日あたりの平均売上 */
  level: number;
  /** 1日に配信する確率 */
  streamRate: number;
  /** 月ごとの成長率 */
  growth: number;
  /** 最近の失速（売上減少アラートのデモ用） */
  slump?: boolean;
}

const APP_SPECS = [
  { app: "IRIAM" as const, count: 50, prefix: "IR", base: 1, level: 3800 },
  { app: "Avvy" as const, count: 40, prefix: "av_", base: 1001, level: 2600 },
  { app: "Mirrativ" as const, count: 30, prefix: "M-", base: 3001, level: 2400 },
];

function generateTalents(today: string, rand: () => number): DemoTalent[] {
  const talents: DemoTalent[] = [];
  const usedNames = new Set<string>();
  const firstMonth = addMonths(monthOf(today), -13);
  const pickName = () => {
    for (let i = 0; i < 1000; i++) {
      const n = FAMILY[Math.floor(rand() * FAMILY.length)] + GIVEN[Math.floor(rand() * GIVEN.length)];
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
    return `タレント${usedNames.size + 1}`;
  };

  for (const spec of APP_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      const id =
        spec.app === "IRIAM" ? `${spec.prefix}${String(spec.base + i).padStart(4, "0")}` : `${spec.prefix}${spec.base + i}`;
      // 登録日は14か月に分散。直近ほど登録が多い
      const monthOffset = Math.floor(Math.pow(rand(), 0.8) * 14);
      const regMonth = addMonths(firstMonth, monthOffset);
      let registeredAt = addDays(monthStart(regMonth), Math.floor(rand() * 28));
      if (registeredAt > today) registeredAt = addDays(today, -Math.floor(rand() * 10));
      const startLag = 3 + Math.floor(rand() * 14);
      const activityStartAt = addDays(registeredAt, startLag) <= today ? addDays(registeredAt, startLag) : null;
      const r = rand();
      let status = activityStartAt ? "配信開始" : "配信準備中";
      if (activityStartAt && r < 0.08) status = "休止";
      else if (activityStartAt && r < 0.12) status = "卒業";
      talents.push({
        app: spec.app,
        id,
        name: pickName(),
        registeredAt,
        activityStartAt,
        status,
        level: spec.level * Math.exp((rand() - 0.5) * 1.6),
        streamRate: 0.25 + rand() * 0.55,
        growth: 1 + (rand() - 0.4) * 0.12,
        slump: rand() < 0.08,
      });
    }
  }

  // アラートのデモ用：IRIAM のトップタレント（売上の偏り）
  const star = talents.find((t) => t.app === "IRIAM" && t.status === "配信開始");
  if (star) {
    star.level = 16000;
    star.streamRate = 0.85;
    star.registeredAt = addDays(monthStart(firstMonth), 3);
    star.activityStartAt = addDays(star.registeredAt, 5);
  }
  // Mirrativ：登録から時間が経っても売上が発生していない3名
  talents
    .filter((t) => t.app === "Mirrativ")
    .slice(-3)
    .forEach((t, i) => {
      t.registeredAt = addDays(today, -(12 + i * 5));
      t.activityStartAt = null;
      t.status = "配信準備中";
      t.streamRate = 0;
    });
  // Avvy：今月の新規登録を少なめにする（新規登録減少アラートのデモ用）
  const cur = monthOf(today);
  talents
    .filter((t) => t.app === "Avvy" && monthOf(t.registeredAt) === cur)
    .slice(1)
    .forEach((t) => {
      t.registeredAt = addDays(monthStart(cur), -10 - Math.floor(rand() * 15));
    });
  // 登録前（まだアプリ登録していない）タレント
  talents.push({
    app: "Avvy",
    id: "av_9001",
    name: pickName(),
    registeredAt: "",
    activityStartAt: null,
    status: "登録前",
    level: 0,
    streamRate: 0,
    growth: 1,
  });
  return talents;
}

function formatForApp(app: string, date: string): string {
  const [y, m, d] = date.split("-");
  if (app === "IRIAM") return `${y}/${m}/${d}`;
  if (app === "Mirrativ") return `${y}${m}${d}`;
  return date;
}

function hms(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const mi = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function generateDemoDataset(today: string, seed = 20260930): RawDataset {
  const rand = mulberry32(seed);
  const talents = generateTalents(today, rand);
  const lastDataDate = addDays(today, -1); // CSVは前日分までを毎日取り込む想定

  const raw: Record<string, RawTable> = {
    IRIAM: { headers: ["日付", "ライバーID", "ライバー名", "配信時間(分)", "配信回数", "報酬額(円)"], rows: [] },
    // Avvy は実際の出力CSV（月次の累計スナップショット）と同じ形式
    Avvy: {
      headers: ["target_month", "snapshot_date", "user_id", "account_name", "agency_joined_date", "first_stream_date", "membership_status", "diamonds", "stream_hours", "stream_count", "stream_days"],
      rows: [],
    },
    Mirrativ: { headers: ["集計日", "配信者ID", "配信者名", "配信時間", "配信数", "収益(円)"], rows: [] },
  };

  // Avvy はタレント×月の累計（月次スナップショット）にまとめて出力する
  const avvyMonthly = new Map<string, { t: DemoTalent; month: string; diamonds: number; minutes: number; count: number; days: number }>();

  for (const t of talents) {
    if (!t.activityStartAt || t.streamRate === 0) continue;
    const stopAt = t.status === "卒業" || t.status === "休止" ? addDays(t.activityStartAt, 60 + Math.floor(rand() * 120)) : null;
    for (let date = t.activityStartAt; date <= lastDataDate; date = addDays(date, 1)) {
      if (stopAt && date > stopAt) break;
      if (rand() > t.streamRate) continue;
      const monthsActive = (Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))) -
        (Number(t.activityStartAt.slice(0, 4)) * 12 + Number(t.activityStartAt.slice(5, 7)));
      let level = t.level * Math.pow(t.growth, monthsActive);
      if (t.slump && monthOf(date) === monthOf(today)) level *= 0.4;
      const revenue = Math.max(0, Math.round((level * (0.3 + rand() * 1.4)) / 10) * 10);
      const minutes = Math.round(45 + rand() * 150);
      const count = 1 + (rand() < 0.25 ? 1 : 0);
      const stamp = `${addDays(date, 1)}T09:00:00+09:00`;
      const batch = `demo-${addDays(date, 1).replace(/-/g, "")}`;
      const d = formatForApp(t.app, date);
      if (t.app === "IRIAM") raw.IRIAM.rows.push([d, t.id, t.name, String(minutes), String(count), revenue.toLocaleString("en-US"), batch, stamp]);
      if (t.app === "Avvy") {
        const k = `${t.id}|${monthOf(date)}`;
        const m = avvyMonthly.get(k) ?? { t, month: monthOf(date), diamonds: 0, minutes: 0, count: 0, days: 0 };
        m.diamonds += revenue;
        m.minutes += minutes;
        m.count += count;
        m.days += 1;
        avvyMonthly.set(k, m);
      }
      if (t.app === "Mirrativ") raw.Mirrativ.rows.push([d, t.id, t.name, hms(minutes), String(count), String(revenue), batch, stamp]);
    }
  }
  avvyMonthly.forEach((m) => {
    const nextMonthStart = monthStart(addMonths(m.month, 1));
    const snapshot = nextMonthStart <= today ? nextMonthStart : today;
    const slash = (v: string | null) => (v ? v.replace(/-/g, "/") : "");
    raw.Avvy.rows.push([
      m.month,
      slash(snapshot),
      m.t.id,
      m.t.name,
      slash(m.t.registeredAt),
      slash(m.t.activityStartAt),
      m.t.status === "卒業" || m.t.status === "休止" ? "Inactive" : "Active",
      String(m.diamonds),
      (m.minutes / 60).toFixed(1),
      String(m.count),
      String(m.days),
      `demo-avvy-${snapshot.replace(/-/g, "")}`,
      `${snapshot}T09:00:00+09:00`,
    ]);
  });
  for (const table of Object.values(raw)) table.headers.push(IMPORT_ID_COLUMN, IMPORTED_AT_COLUMN);

  // 重複取込のデモ：IRIAM の前日分CSVを同じ内容でもう一度取り込んだ状態
  const dupDate = formatForApp("IRIAM", lastDataDate);
  const dupRows = raw.IRIAM.rows
    .filter((r) => r[0] === dupDate)
    .map((r) => [...r.slice(0, 6), `demo-reimport`, `${today}T10:30:00+09:00`]);
  raw.IRIAM.rows.push(...dupRows);

  const talentsTable: RawTable = {
    headers: TALENTS_HEADERS,
    rows: talents.map((t) => [
      t.id,
      t.name,
      t.app,
      t.registeredAt ? t.registeredAt.replace(/-/g, "/") : "",
      t.activityStartAt ? t.activityStartAt.replace(/-/g, "/") : "",
      t.status,
    ]),
  };

  const kpiRows: string[][] = [];
  const curMonth = monthOf(today);
  for (let i = -3; i <= 0; i++) {
    const m = addMonths(curMonth, i).replace("-", "/");
    kpiRows.push(
      [m, "IRIAM", "売上", "2000000", ""],
      [m, "IRIAM", "新規登録", "6", ""],
      [m, "IRIAM", "タレント売上", "80000", ""],
      [m, "Avvy", "売上", "1000000", ""],
      [m, "Avvy", "新規登録", "5", ""],
      [m, "Avvy", "タレント売上", "40000", ""],
      [m, "Mirrativ", "売上", "700000", ""],
      [m, "Mirrativ", "新規登録", "4", ""],
      [m, "Mirrativ", "タレント売上", "40000", ""],
      [m, "全体", "活動開始", "12", ""],
      [m, "全体", "配信者数", "85", ""],
      [m, "全体", "売上発生人数", "80", ""]
    );
  }
  const star = talents.find((t) => t.app === "IRIAM" && t.level === 16000);
  if (star) kpiRows.push([curMonth.replace("-", "/"), "IRIAM", "タレント売上", "300000", star.id]);

  return {
    raw,
    talents: talentsTable,
    kpi: { headers: KPI_HEADERS, rows: kpiRows },
    mapping: null,
    settings: { headers: SETTINGS_HEADERS, rows: [] },
    missingSheets: [],
  };
}

// ---- メモリ上のデモストア ----

interface DemoStore {
  today: string;
  sheets: Map<string, RawTable>;
}

const globalForDemo = globalThis as unknown as { revenueDemoStore?: DemoStore };

const RAW_SHEETS: Record<string, string> = Object.fromEntries(APPS.map((a) => [a.id, a.rawSheet]));

function getStore(today: string): DemoStore {
  const existing = globalForDemo.revenueDemoStore;
  if (existing && existing.today === today) return existing;
  const data = generateDemoDataset(today);
  const sheets = new Map<string, RawTable>();
  for (const [app, sheet] of Object.entries(RAW_SHEETS)) sheets.set(sheet, data.raw[app]);
  sheets.set(SHEET_NAMES.talents, data.talents);
  sheets.set(SHEET_NAMES.kpi, data.kpi);
  if (data.settings) sheets.set(SHEET_NAMES.settings, data.settings);
  const store = { today, sheets };
  globalForDemo.revenueDemoStore = store;
  return store;
}

export function createDemoDataSource(today: string): RevenueDataSource {
  const store = getStore(parseDate(today) ?? today);
  return {
    kind: "demo",
    label: "ダミーデータ（デモモード）",
    writable: true,
    async load() {
      const get = (name: string) => store.sheets.get(name) ?? { headers: [], rows: [] };
      return {
        raw: Object.fromEntries(Object.entries(RAW_SHEETS).map(([app, sheet]) => [app, get(sheet)])),
        talents: get(SHEET_NAMES.talents),
        kpi: get(SHEET_NAMES.kpi),
        mapping: store.sheets.get(SHEET_NAMES.mapping) ?? null,
        settings: store.sheets.get(SHEET_NAMES.settings) ?? null,
        missingSheets: [],
      };
    },
    async appendRows(sheet, headers, rows) {
      const existing = store.sheets.get(sheet) ?? { headers: [], rows: [] };
      store.sheets.set(sheet, mergeRowsIntoTable(existing, headers, rows));
    },
    async replaceSheet(sheet, table) {
      store.sheets.set(sheet, { headers: [...table.headers], rows: table.rows.map((r) => [...r]) });
    },
    async ensureSheets() {
      return [];
    },
  };
}
