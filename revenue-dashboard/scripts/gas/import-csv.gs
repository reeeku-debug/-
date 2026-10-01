/**
 * 配信収益ダッシュボード：Google ドライブ上のCSVを RAW シートへ自動取込する Apps Script
 *
 * 使い方
 *   1. データソースのスプレッドシートを開き「拡張機能 → Apps Script」にこのファイルを貼り付ける
 *   2. 下の FOLDERS に、アプリごとのCSV置き場（Googleドライブのフォルダ）のIDを設定する
 *   3. importAll を一度手動実行して権限を許可する
 *   4. 「トリガー」から importAll を毎日（例: 午前9時〜10時）実行するよう設定する
 *
 * 動作
 *   - フォルダ内の未処理CSVを読み込み、RAWシートに「CSVの列そのまま + _import_id / _imported_at」で追記する
 *   - 取込済みのファイルは「processed」サブフォルダへ移動する
 *   - 重複の最終判定はダッシュボード側（app + 日付 + タレントID の最新取込を採用）で行うため、
 *     同じCSVを二重に取り込んでも二重計上されない
 *   - 文字コードは UTF-8 で読めなければ Shift_JIS として読む
 */

const FOLDERS = {
  IRIAM: { folderId: "ここにフォルダID", sheet: "IRIAM_RAW" },
  Avvy: { folderId: "ここにフォルダID", sheet: "AVVY_RAW" },
  Mirrativ: { folderId: "ここにフォルダID", sheet: "MIRRATIV_RAW" },
};

function importAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];
  Object.keys(FOLDERS).forEach(function (app) {
    const conf = FOLDERS[app];
    if (!conf.folderId || conf.folderId.indexOf("ここに") === 0) return;
    const folder = DriveApp.getFolderById(conf.folderId);
    const processed = getOrCreateSubfolder_(folder, "processed");
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (!/\.(csv|tsv|txt)$/i.test(file.getName())) continue;
      const count = importFile_(ss, app, conf.sheet, file);
      file.moveTo(processed);
      log.push(app + ": " + file.getName() + " → " + count + "行");
    }
  });
  console.log(log.length ? log.join("\n") : "取り込むCSVはありませんでした");
}

function importFile_(ss, app, sheetName, file) {
  const blob = file.getBlob();
  let text = blob.getDataAsString("UTF-8");
  if (text.indexOf("�") >= 0) text = blob.getDataAsString("Shift_JIS");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = text.split(/\r?\n/, 1)[0].indexOf("\t") >= 0 ? "\t" : ",";
  const values = Utilities.parseCsv(text, delimiter).filter(function (r) {
    return r.some(function (c) { return String(c).trim() !== ""; });
  });
  if (values.length < 2) return 0;

  const csvHeaders = values[0].map(function (h) { return String(h).trim(); });
  const rows = values.slice(1);
  const now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
  const importId = app + "-" + now.replace(/[^0-9]/g, "").slice(0, 14);

  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  let headers = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  const wanted = csvHeaders.concat(["_import_id", "_imported_at"]);
  let changed = false;
  wanted.forEach(function (h) {
    if (headers.indexOf(h) < 0) {
      headers.push(h);
      changed = true;
    }
  });
  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const out = rows.map(function (r) {
    const line = new Array(headers.length).fill("");
    csvHeaders.forEach(function (h, i) { line[headers.indexOf(h)] = r[i] === undefined ? "" : r[i]; });
    line[headers.indexOf("_import_id")] = importId;
    line[headers.indexOf("_imported_at")] = now;
    return line;
  });
  const start = sheet.getLastRow() + 1;
  // CSVの値を文字列のまま保存（IDの先頭0や日付の自動変換を防ぐ）
  sheet.getRange(start, 1, out.length, headers.length).setNumberFormat("@").setValues(out);
  return out.length;
}

function getOrCreateSubfolder_(folder, name) {
  const it = folder.getFoldersByName(name);
  return it.hasNext() ? it.next() : folder.createFolder(name);
}
