import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, decodeCsvBuffer } from "../../src/lib/revenue/csv";
import { parseDate, parseDurationMinutes, parseMonth, parseNumber } from "../../src/lib/revenue/parse";

test("parseNumber は通貨記号・カンマ・全角を扱える", () => {
  assert.equal(parseNumber("¥1,234"), 1234);
  assert.equal(parseNumber("1,234円"), 1234);
  assert.equal(parseNumber("１２３４"), 1234);
  assert.equal(parseNumber("(1,000)"), -1000);
  assert.equal(parseNumber("-50.5"), -50.5);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber(42), 42);
});

test("parseDate は主要な日付形式を YYYY-MM-DD にする", () => {
  assert.equal(parseDate("2026/9/1"), "2026-09-01");
  assert.equal(parseDate("2026-09-01 12:34:56"), "2026-09-01");
  assert.equal(parseDate("2026年9月1日"), "2026-09-01");
  assert.equal(parseDate("20260901"), "2026-09-01");
  assert.equal(parseDate("2026-09-01T03:00:00Z"), "2026-09-01");
  assert.equal(parseDate(46266), "2026-09-01"); // スプレッドシートのシリアル値
  assert.equal(parseDate("2026/02/30"), null);
  assert.equal(parseDate(""), null);
});

test("parseMonth", () => {
  assert.equal(parseMonth("2026/09"), "2026-09");
  assert.equal(parseMonth("2026年9月"), "2026-09");
  assert.equal(parseMonth("2026-09-15"), "2026-09");
});

test("parseDurationMinutes は単位と h:mm:ss 形式に対応", () => {
  assert.equal(parseDurationMinutes("90", "minutes"), 90);
  assert.equal(parseDurationMinutes("5400", "seconds"), 90);
  assert.equal(parseDurationMinutes("1.5", "hours"), 90);
  assert.equal(parseDurationMinutes("1:30:00", "minutes"), 90);
  assert.equal(parseDurationMinutes("1時間30分", "minutes"), 90);
});

test("parseCsv は引用符・改行・BOM・CRLF を扱える", () => {
  const csv = '﻿日付,名前,メモ\r\n2026/09/01,"山田, 花子","1行目\n2行目"\r\n\r\n2026/09/02,"""引用""",\r\n';
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.headers, ["日付", "名前", "メモ"]);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], ["2026/09/01", "山田, 花子", "1行目\n2行目"]);
  assert.deepEqual(parsed.rows[1], ["2026/09/02", '"引用"', ""]);
});

test("decodeCsvBuffer は Shift_JIS を自動判定する", () => {
  // "日付" を Shift_JIS でエンコードしたバイト列
  const sjis = new Uint8Array([0x93, 0xfa, 0x95, 0x74]);
  assert.equal(decodeCsvBuffer(sjis), "日付");
  assert.equal(decodeCsvBuffer(new TextEncoder().encode("日付")), "日付");
});
