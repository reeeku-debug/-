/**
 * 配信収益ダッシュボード：スプレッドシート連携用 Apps Script（ウェブアプリ）
 *
 * ダッシュボード（Vercel）はこのスクリプトを経由してスプレッドシートを読み書きします。
 * Google Cloud のサービスアカウントや鍵は不要です。
 *
 * 設定手順
 *   1. データを保存するスプレッドシートを開き「拡張機能 → Apps Script」を開く
 *   2. 最初からある「コード.gs」の中身をすべて消して、このファイルの中身を貼り付ける
 *   3. 下の TOKEN を、推測されにくい長い英数字（合言葉）に書き換えて保存する
 *   4. 右上「デプロイ → 新しいデプロイ」→ 種類の選択（歯車）で「ウェブアプリ」を選ぶ
 *        次のユーザーとして実行：自分
 *        アクセスできるユーザー：全員
 *      → 「デプロイ」→ 権限の確認画面で自分のアカウントを選び「許可」
 *   5. 表示された「ウェブアプリ URL」（https://script.google.com/macros/s/…/exec）をコピー
 *   6. Vercel の環境変数に設定して Redeploy
 *        GAS_WEBAPP_URL = 手順5のURL
 *        GAS_TOKEN      = 手順3の合言葉
 *
 * ※ スクリプトを書き換えた場合は「デプロイ → デプロイを管理 → 編集（鉛筆）→ バージョン：新バージョン」で更新する。
 * ※ 合言葉を知らない人からのリクエストはすべて拒否されます。合言葉は他人に教えないでください。
 */

const TOKEN = "ここを長い合言葉に書き換える";

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!TOKEN || TOKEN.indexOf("ここを") === 0) return json_({ ok: false, error: "スクリプトの TOKEN が未設定です" });
    if (req.token !== TOKEN) return json_({ ok: false, error: "unauthorized" });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (req.action) {
      case "load":
        return json_({ ok: true, titles: titles_(ss), tables: load_(ss, req.sheets || []) });
      case "append":
        append_(ss, req.sheet, req.headers || [], req.rows || []);
        return json_({ ok: true });
      case "replace":
        replace_(ss, req.sheet, req.headers || [], req.rows || []);
        return json_({ ok: true });
      case "ensure":
        return json_({ ok: true, created: ensure_(ss, req.defs || []) });
      default:
        return json_({ ok: false, error: "unknown action: " + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return json_({ ok: true, message: "revenue-dashboard webapp is running" });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function titles_(ss) {
  return ss.getSheets().map(function (s) { return s.getName(); });
}

/** セルの値を文字列にする（日付はダッシュボードが読める形式に） */
function cell_(v) {
  if (v === null || v === undefined) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    const tz = Session.getScriptTimeZone();
    const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, tz, hasTime ? "yyyy-MM-dd'T'HH:mm:ssXXX" : "yyyy/MM/dd");
  }
  return String(v);
}

function load_(ss, names) {
  const out = {};
  names.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
      out[name] = [];
      return;
    }
    out[name] = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues().map(function (row) {
      return row.map(cell_);
    });
  });
  return out;
}

function sheetFor_(ss, name) {
  if (!name) throw new Error("sheet が指定されていません");
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** 行を追記する。既存ヘッダーにない列はヘッダーに足し、列の並びを揃える */
function append_(ss, name, headers, rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = sheetFor_(ss, name);
    const current = sheet.getLastRow() > 0 && sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
      : [];
    const merged = current.slice();
    headers.forEach(function (h) { if (merged.indexOf(h) < 0) merged.push(h); });
    if (merged.length !== current.length) {
      sheet.getRange(1, 1, 1, merged.length).setNumberFormat("@").setValues([merged]);
    }
    if (rows.length === 0) return;
    const idx = headers.map(function (h) { return merged.indexOf(h); });
    const out = rows.map(function (r) {
      const line = new Array(merged.length).fill("");
      idx.forEach(function (to, from) { line[to] = r[from] === undefined || r[from] === null ? "" : String(r[from]); });
      return line;
    });
    const start = Math.max(sheet.getLastRow(), 1) + 1;
    // 値は文字列のまま保存（IDの先頭0や日付の自動変換を防ぐ）
    sheet.getRange(start, 1, out.length, merged.length).setNumberFormat("@").setValues(out);
  } finally {
    lock.releaseLock();
  }
}

function replace_(ss, name, headers, rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = sheetFor_(ss, name);
    sheet.clearContents();
    const values = [headers].concat(rows.map(function (r) {
      return headers.map(function (_, i) { return r[i] === undefined || r[i] === null ? "" : String(r[i]); });
    }));
    if (headers.length > 0) sheet.getRange(1, 1, values.length, headers.length).setNumberFormat("@").setValues(values);
  } finally {
    lock.releaseLock();
  }
}

function ensure_(ss, defs) {
  const created = [];
  defs.forEach(function (d) {
    if (ss.getSheetByName(d.name)) return;
    const sheet = ss.insertSheet(d.name);
    if (d.headers && d.headers.length > 0) {
      sheet.getRange(1, 1, 1, d.headers.length).setNumberFormat("@").setValues([d.headers]);
    }
    created.push(d.name);
  });
  return created;
}
