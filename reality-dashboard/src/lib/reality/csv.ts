// REALITY の配信レポートCSVの読み取り（取込前のチェック用。実際の取込はスプレッドシート側でも同じ形で読む）

export const COLUMN_ALIASES: Record<string, string[]> = {
  id: ["ID", "配信者ID", "ユーザーID", "ユーザーId", "streamer_id", "user_id", "userId"],
  name: ["配信者名", "ユーザー名", "名前", "ニックネーム", "表示名", "name"],
  rank: ["REALITYランク", "ランク", "rank"],
  count: ["配信回数", "合計配信回数"],
  hours: ["合計配信時間（時）", "合計配信時間（h）", "配信時間（時）", "配信時間（h）", "合計配信時間", "配信時間"],
  viewers: ["視聴者数", "合計視聴者数", "ユニーク視聴者数"],
  gift: ["合計ギフト金額", "ギフト金額（円）", "ギフト金額", "合計ギフト"],
  score: ["合計獲得スコア", "獲得スコア", "スコア", "合計スコア"],
  events: ["参加中のイベント", "イベント参加数", "イベント数"],
  debut: ["初配信日", "デビュー日"],
};
const REQUIRED = ["id", "name", "hours", "gift"];

export interface CsvRecord {
  id: string;
  name: string;
  hours: number;
  gift: number;
  events: number;
}

export interface CsvPeriod {
  start: string; // yyyy/mm/dd
  end: string;
  month: number; // yyyymm
}

export function decodeCsv(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("shift_jis").decode(buf);
  }
  return text.replace(/^﻿/, "");
}

export function parseCsvText(text: string, delim = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(f);
      f = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += ch;
  }
  if (f !== "" || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/^﻿/, "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s　"']/g, "")
    .toLowerCase();

export function findColumns(header: string[]): Record<string, number> {
  const n = header.map(norm);
  const out: Record<string, number> = {};
  for (const k of Object.keys(COLUMN_ALIASES)) {
    const aliases = COLUMN_ALIASES[k].map(norm);
    out[k] = -1;
    // 完全一致 → 「列名（単位）」のように後ろに括弧が付いた列 の順で探す
    aliases.some((a) => (out[k] = n.indexOf(a)) >= 0);
    if (out[k] < 0) aliases.some((a) => (out[k] = n.findIndex((h) => h.startsWith(`${a}(`))) >= 0);
  }
  return out;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[¥￥,，円\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseHours(v: string, header: string): number {
  const s = v.trim();
  if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return +m[1] + +m[2] / 60 + +(m[3] ?? 0) / 3600;
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*時間)?\s*(?:(\d+(?:\.\d+)?)\s*分)?\s*(?:(\d+(?:\.\d+)?)\s*秒)?$/);
  if (m && (m[1] || m[2] || m[3])) return +(m[1] ?? 0) + +(m[2] ?? 0) / 60 + +(m[3] ?? 0) / 3600;
  const n = num(s);
  const h = norm(header);
  if (/分|min/.test(h)) return n / 60;
  if (/秒|sec/.test(h)) return n / 3600;
  return n;
}

export function countEvents(v: string): number {
  const s = v.trim();
  if (!s || s === "-" || s === "—" || s === "なし") return 0;
  if (/^\d+(\.\d+)?\s*(件|回)?$/.test(s)) return parseFloat(s);
  return s.split(/[\r\n,、，;；|｜]+/).filter((x) => x.trim()).length;
}

/** CSV を読み、列が足りなければ分かりやすいエラーを投げる */
export function parseRealityCsv(text: string): CsvRecord[] {
  const first = text.split(/\r?\n/, 1)[0];
  const delim = first.includes("\t") && !first.includes(",") ? "\t" : ",";
  const rows = parseCsvText(text, delim).filter((r) => r.some((c) => c.trim() !== ""));
  let at = -1;
  let col: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 10) && at < 0; i++) {
    const f = findColumns(rows[i]);
    if (REQUIRED.every((k) => f[k] >= 0)) {
      at = i;
      col = f;
    }
  }
  if (at < 0) {
    const f = findColumns(rows[0] ?? []);
    const miss = REQUIRED.filter((k) => f[k] < 0).map((k) => COLUMN_ALIASES[k][0]);
    throw new Error(`列が見つかりません：${miss.join("・")}。CSVの列：${(rows[0] ?? []).slice(0, 14).join(" / ")}`);
  }
  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? String(r[i] ?? "").trim() : "");
  const header = rows[at][col.hours];
  const byId = new Map<string, CsvRecord>();
  for (const r of rows.slice(at + 1)) {
    const id = cell(r, col.id);
    if (!id) continue;
    byId.set(id, {
      id,
      name: cell(r, col.name),
      hours: parseHours(cell(r, col.hours), header),
      gift: num(cell(r, col.gift)),
      events: countEvents(cell(r, col.events)),
    });
  }
  return Array.from(byId.values());
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ファイル名 streamer_20261001_20261015.csv から期間を読む */
export function periodFromName(name: string): CsvPeriod | null {
  const m = name.match(/(\d{4})(\d{2})(\d{2})\D+(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const start = `${m[1]}/${m[2]}/${m[3]}`;
  const end = `${m[4]}/${m[5]}/${m[6]}`;
  return { start, end, month: +m[1] * 100 + +m[2] };
}

/** 月を指定したときの期間（その月の1日〜末日） */
export function periodOfMonth(month: number): CsvPeriod {
  const y = Math.floor(month / 100);
  const m = month % 100;
  return { start: `${y}/${pad(m)}/01`, end: `${y}/${pad(m)}/${pad(new Date(y, m, 0).getDate())}`, month };
}
