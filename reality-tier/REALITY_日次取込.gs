// REALITY ティア判定：日次CSV取込・ティア自動判定・月別ティア表示
//
// スプレッドシート「REALITY_ティア判定_週次KPI」に貼り付けて使う Apps Script です。
//
//   ① 毎日：REALITY の CSV（月初からの累計）を取り込む
//        - Googleドライブの取込フォルダから自動（毎日10時）
//        - または メニュー「REALITY取込 → CSVをアップロードして取込」から手動
//   ② 日次RAW に前回CSVとの差分（増分）を記録、月次RAW のその月を最新の累計で上書き
//   ③ タレントマスタに新しいタレントを追加、ティア判定の一覧を最新月の在籍者に更新
//      （ティア判定／タレント分け／サマリー／週次KPI はシートの数式で自動計算）
//   ④ 「ティア推移」を全月ぶん再判定し、「月別ティア」「月別ティア明細」を更新
//      （月別ティアのB3で月を選ぶと、その月のティア別メンバーに切り替わる）
//
// セットアップ手順は同じフォルダの README.md を参照してください。

// ===== 設定（ここだけ書き換える） ==========================================

/** CSVを入れるGoogleドライブのフォルダID（URLの folders/ の後ろ） */
const FOLDER_ID = 'ここにフォルダID';

/** 自動取込を実行する時刻（時） */
const DAILY_HOUR = 10;

/**
 * CSVの列名の候補。REALITYのCSVの列名が変わったら、ここに列名を追加してください。
 * 左から順に探し、最初に見つかった列を使います（全角/半角・空白・大文字小文字の違いは無視）。
 */
const COLUMN_ALIASES = {
  id: ['ID', '配信者ID', 'ユーザーID', 'ユーザーId', 'streamer_id', 'user_id', 'userId'],
  name: ['配信者名', 'ユーザー名', '名前', 'ニックネーム', '表示名', 'name'],
  rank: ['REALITYランク', 'ランク', 'rank'],
  count: ['配信回数', '合計配信回数'],
  hours: ['配信時間（h）', '配信時間(h)', '合計配信時間', '配信時間'],
  viewers: ['視聴者数', '合計視聴者数', 'ユニーク視聴者数'],
  gift: ['合計ギフト金額', 'ギフト金額（円）', 'ギフト金額', '合計ギフト'],
  score: ['スコア', '合計スコア'],
  events: ['参加中のイベント', 'イベント参加数', 'イベント数'],
  debut: ['初配信日', 'デビュー日'],
};
const REQUIRED_COLUMNS = ['id', 'name', 'hours', 'gift'];

// ===== シート名・定数 ======================================================

const SHEET = {
  settings: '設定',
  judge: 'ティア判定',
  master: 'タレントマスタ',
  monthly: '月次RAW',
  daily: '日次RAW',
  log: '取込ログ',
  history: 'ティア推移',
  byMonth: '月別ティア',
  byMonthDetail: '月別ティア明細',
};
const TZ = 'Asia/Tokyo';
const JUDGE_FIRST_ROW = 5;
const JUDGE_FORMULA_ROWS = 500;
const MASTER_FIRST_ROW = 5;
const TIERS = ['T1', 'T2', 'T3', 'T4', 'T5', '未評価'];
const TIER_DESC = {
  T1: '月60h・イベント5回＋3ヶ月平均50万円以上',
  T2: '月60h・イベント5回＋3ヶ月平均30万円以上',
  T3: 'デビュー3ヶ月以内に月10万円（既存は直近3ヶ月）',
  T4: '初月60h・イベント5回／10万円待ち',
  T5: '上記以外',
  未評価: '評価月より後にデビュー',
};
const TIER_COLOR = {
  T1: '#FCE8B2',
  T2: '#D9EAD3',
  T3: '#CFE2F3',
  T4: '#EAD1DC',
  T5: '#EFEFEF',
  未評価: '#FFFFFF',
};
const HEADER_BG = '#1F5FAE';
const HEADER_FG = '#FFFFFF';

// ===== メニュー・トリガー ==================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('REALITY取込')
    .addItem('CSVをアップロードして取込…', 'showUploadDialog')
    .addItem('フォルダのCSVを今すぐ取込', 'dailyImport')
    .addItem('アプリの書き出しCSVを取込（全月）…', 'showAppImportDialog')
    .addSeparator()
    .addItem('月別ティアを更新', 'refreshMonthlyView')
    .addItem('ティア推移を再計算', 'refreshTierHistory')
    .addSeparator()
    .addItem('自動取込（毎日' + DAILY_HOUR + '時）を設定', 'setupTrigger')
    .addToUi();
}

/** 月別ティアのB3（表示する月）を変えたら表示を切り替える（シンプルトリガー） */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET.byMonth || e.range.getA1Notation() !== 'B3') return;
  renderMonthlyView_(e.source, parseMonthLabel_(e.range.getValue()));
}

/** 毎日 DAILY_HOUR 時に dailyImport を実行するトリガーを登録（重複登録はしない） */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyImport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyImport').timeBased().atHour(DAILY_HOUR).everyDays(1).inTimezone(TZ).create();
  const fixed = fixJudgeFormulas_(SpreadsheetApp.getActiveSpreadsheet());
  notify_('毎日' + DAILY_HOUR + '時の自動取込を設定しました。' + (fixed ? 'ティア判定の数式（11・12月デビューの3ヶ月目）も修正しました。' : ''));
}

/**
 * ティア判定シートの数式の修正：11月・12月デビューの「デビュー月＋2ヶ月」が
 * F+88（例：202511→202599）になっていたのを F+90（→202601）に直す。何度実行しても安全。
 * @return {number} 修正したセル数
 */
function fixJudgeFormulas_(ss) {
  const sheet = ss.getSheetByName(SHEET.judge);
  let fixed = 0;
  ['Q', 'U'].forEach(function (col) {
    const range = sheet.getRange(col + JUDGE_FIRST_ROW + ':' + col + (JUDGE_FIRST_ROW + JUDGE_FORMULA_ROWS - 1));
    const formulas = range.getFormulas();
    let changed = false;
    formulas.forEach(function (r) {
      const next = r[0].replace(/(MOD\(F\d+,100\)>=11,F\d+)\+88/g, '$1+90');
      if (next !== r[0]) {
        r[0] = next;
        changed = true;
        fixed++;
      }
    });
    if (changed) range.setFormulas(formulas);
  });
  return fixed;
}

// ===== 取込（フォルダ） ====================================================

/** 取込フォルダの未取込CSVを、期間の古い順にすべて取り込む */
function dailyImport() {
  if (!FOLDER_ID || FOLDER_ID.indexOf('ここに') === 0) {
    throw new Error('FOLDER_ID が未設定です。スクリプト先頭の FOLDER_ID にフォルダIDを貼り付けてください。');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  withLock_(function () {
    const done = importedFileIds_(ss);
    const files = [];
    const it = DriveApp.getFolderById(FOLDER_ID).getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (!/\.(csv|tsv|txt)$/i.test(f.getName()) || done[f.getId()]) continue;
      files.push(f);
    }
    files.sort(function (a, b) {
      return periodSortKey_(a.getName()) < periodSortKey_(b.getName()) ? -1 : 1;
    });

    let imported = 0;
    files.forEach(function (f) {
      const res = importCsv_(ss, readBlobText_(f.getBlob()), f.getName(), f.getId(), null);
      if (res.ok) imported++;
    });
    if (imported > 0) refreshAll_(ss);
    console.log('取込対象 ' + files.length + ' 件 / 取込 ' + imported + ' 件');
  });
}

// ===== 取込（アップロード） ================================================

function showUploadDialog() {
  const html = HtmlService.createHtmlOutput(UPLOAD_HTML_).setWidth(520).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'REALITYのCSVを取り込む');
}

/**
 * ダイアログから呼ばれる。files: [{name, text, start, end}]（start/end は yyyy-mm-dd、省略可）
 * @return {string[]} 結果メッセージ
 */
function importUploadedCsv(files) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const messages = [];
  withLock_(function () {
    const list = files.slice().sort(function (a, b) {
      return periodSortKey_(a.name, a.start, a.end) < periodSortKey_(b.name, b.start, b.end) ? -1 : 1;
    });
    let imported = 0;
    list.forEach(function (f) {
      const period = f.start && f.end ? { start: parseDate_(f.start), end: parseDate_(f.end) } : null;
      const res = importCsv_(ss, f.text, f.name, '（アップロード）', period);
      if (res.ok) imported++;
      messages.push(f.name + '：' + res.message);
    });
    if (imported > 0) refreshAll_(ss);
  });
  return messages;
}

// ===== 取込（ティア判定アプリの書き出し） ===================================

function showAppImportDialog() {
  const html = HtmlService.createHtmlOutput(APP_IMPORT_HTML_).setWidth(480).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'アプリの書き出しCSVを取り込む');
}

/**
 * ティア判定アプリの「スプレッドシート用に書き出し」CSVを取り込む。
 * CSVに入っている月を、月次RAWでまるごと置き換える（日次RAWは変えない）
 * @return {string} 結果メッセージ
 */
function importAppExport(fileName, text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let message = '';
  withLock_(function () {
    try {
      const byMonth = parseAppExport_(text);
      const months = Object.keys(byMonth).map(Number).sort(function (a, b) { return a - b; });
      let count = 0;
      let records = [];
      months.forEach(function (m) {
        count += byMonth[m].length;
        records = records.concat(byMonth[m]); // 古い月から順に：名前は最新月のものが残る
      });
      replaceMonths_(ss, byMonth, 'アプリから取込', fileName);
      upsertMaster_(ss, records);
      const warn = updateJudgeRoster_(ss);
      const range = monthLabel_(months[0]) + '〜' + monthLabel_(months[months.length - 1]);
      message = 'OK・' + months.length + 'ヶ月（' + range + '）' + (warn ? '（' + warn + '）' : '');
      appendLog_(ss, '（アプリ書き出し）', fileName, '', count, message);
      refreshAll_(ss);
    } catch (err) {
      message = 'エラー：' + (err && err.message ? err.message : err);
      appendLog_(ss, '（アプリ書き出し）', fileName, '', 0, message);
    }
  });
  return message;
}

/** アプリの書き出しCSV → {yyyymm: records} */
function parseAppExport_(text) {
  const rows = parseCsvText_(String(text || '').replace(/^\uFEFF/, ''), ',').filter(function (r) {
    return r.some(function (c) { return String(c).trim() !== ''; });
  });
  if (rows.length < 2) throw new Error('データ行がありません');
  const head = rows[0].map(normHeader_);
  const col = function (name) { return head.indexOf(normHeader_(name)); };
  const c = {
    month: col('月キー'), id: col('ID'), name: col('配信者名'), rank: col('REALITYランク'), count: col('配信回数'),
    hours: col('配信時間（h）'), viewers: col('視聴者数'), gift: col('ギフト金額（円）'), score: col('スコア'),
    events: col('イベント参加数'), debut: col('初配信日'), owner: col('担当者'),
  };
  if (c.month < 0 || c.id < 0 || c.gift < 0 || c.hours < 0) {
    throw new Error('ティア判定アプリの「スプレッドシート用に書き出し」CSVではありません（月キー・ID・配信時間・ギフト金額の列が必要）');
  }
  const byMonth = {};
  rows.slice(1).forEach(function (r) {
    const m = Number(cell_(r, c.month));
    const id = cell_(r, c.id);
    if (!m || !id) return;
    const d = parseDate_(cell_(r, c.debut));
    (byMonth[m] || (byMonth[m] = [])).push({
      id: id, name: cell_(r, c.name), rank: cell_(r, c.rank), count: num_(cell_(r, c.count)), hours: num_(cell_(r, c.hours)),
      viewers: num_(cell_(r, c.viewers)), gift: num_(cell_(r, c.gift)), score: num_(cell_(r, c.score)),
      events: num_(cell_(r, c.events)), debut: d ? fmtDate_(d) : '', owner: cell_(r, c.owner),
    });
  });
  if (!Object.keys(byMonth).length) throw new Error('データ行がありません');
  return byMonth;
}

// ===== 取込本体 ============================================================

/**
 * CSV 1本を取り込む。結果は取込ログに記録する。
 * @return {{ok: boolean, message: string}}
 */
function importCsv_(ss, text, fileName, fileId, periodOverride) {
  let targetDate = '';
  try {
    const period = periodOverride || periodFromFileName_(fileName);
    if (!period) throw new Error('ファイル名から期間を読み取れません（例：streamer_20261001_20261005.csv）');
    if (period.end < period.start) throw new Error('期間の終了日が開始日より前です');
    targetDate = period.end;
    const monthKey = ym_(period.start);
    if (ym_(period.end) !== monthKey) throw new Error('期間が月をまたいでいます（月初からの累計CSVを入れてください）');

    const records = parseRealityCsv_(text);
    if (records.length === 0) throw new Error('データ行がありません');

    // 同じ月で取込済みの最新期間と比べて、重複・古いCSVを弾く
    const daily = ss.getSheetByName(SHEET.daily);
    const prev = latestDailySnapshot_(daily, monthKey);
    if (prev.end && ymd_(period.end) <= ymd_(prev.end)) {
      const msg =
        ymd_(period.end) === ymd_(prev.end)
          ? '新しいデータなし（重複）'
          : 'スキップ：取込済み（' + fmtDate_(prev.end) + 'まで）より古い期間';
      appendLog_(ss, fileId, fileName, targetDate, 0, msg);
      return { ok: false, message: msg };
    }

    appendDaily_(daily, period, records, prev.byId, fileName);
    replaceMonthly_(ss, monthKey, records, fileName);
    upsertMaster_(ss, records);
    const warn = updateJudgeRoster_(ss);

    const msg = 'OK' + (warn ? '（' + warn + '）' : '');
    appendLog_(ss, fileId, fileName, targetDate, records.length, msg);
    return { ok: true, message: msg + '・' + records.length + '行' };
  } catch (err) {
    const msg = 'エラー：' + (err && err.message ? err.message : err);
    appendLog_(ss, fileId, fileName, targetDate, 0, msg);
    return { ok: false, message: msg };
  }
}

/** 日次RAWから、その月で最後に取り込んだ期間の累計値を取り出す */
function latestDailySnapshot_(sheet, monthKey) {
  const last = sheet.getLastRow();
  const out = { end: null, byId: {} };
  if (last < 2) return out;
  const values = sheet.getRange(2, 1, last - 1, 9).getValues();
  let maxEnd = 0;
  values.forEach(function (r) {
    const s = parseDate_(r[1]);
    const e = parseDate_(r[2]);
    if (s && e && ym_(s) === monthKey && ymd_(e) > maxEnd) {
      maxEnd = ymd_(e);
      out.end = e;
    }
  });
  if (!maxEnd) return out;
  values.forEach(function (r) {
    const s = parseDate_(r[1]);
    const e = parseDate_(r[2]);
    if (s && e && ym_(s) === monthKey && ymd_(e) === maxEnd) {
      out.byId[String(r[3]).trim()] = { count: num_(r[5]), hours: num_(r[6]), gift: num_(r[7]), score: num_(r[8]) };
    }
  });
  return out;
}

function appendDaily_(sheet, period, records, prevById, fileName) {
  const zero = { count: 0, hours: 0, gift: 0, score: 0 };
  const rows = records.map(function (r) {
    const p = prevById[r.id] || zero;
    return [
      period.end, period.start, period.end, r.id, r.name,
      r.count, r.hours, r.gift, r.score, r.events,
      round_(r.count - p.count), round_(r.hours - p.hours), round_(r.gift - p.gift), round_(r.score - p.score),
      fileName,
    ];
  });
  const start = sheet.getLastRow() + 1;
  ensureRows_(sheet, start + rows.length - 1);
  sheet.getRange(start, 4, rows.length, 2).setNumberFormat('@');
  sheet.getRange(start, 15, rows.length, 1).setNumberFormat('@');
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(start, 1, rows.length, 3).setNumberFormat('yyyy/mm/dd');
}

/** 月次RAWのその月の行を、最新の累計で置き換える（月キー順を保つ） */
function replaceMonthly_(ss, monthKey, records, fileName) {
  const byMonth = {};
  byMonth[monthKey] = records;
  replaceMonths_(ss, byMonth, '日次取込', fileName);
}

/** 月次RAWの複数の月を一度に置き換える。byMonth: {yyyymm: records} */
function replaceMonths_(ss, byMonth, label, fileName) {
  const sheet = ss.getSheetByName(SHEET.monthly);
  const width = 13;
  const last = sheet.getLastRow();
  const kept = last >= 2
    ? sheet.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
        return r[0] !== '' && !(Number(r[0]) in byMonth);
      })
    : [];
  const stamp = label + ' ' + Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd HH:mm') + '（' + fileName + '）';
  let fresh = [];
  Object.keys(byMonth).forEach(function (key) {
    const monthKey = Number(key);
    fresh = fresh.concat(byMonth[key]
      .slice()
      .sort(function (a, b) { return b.gift - a.gift; })
      .map(function (r) {
        return [monthKey, r.id, r.name, r.rank, r.count, r.hours, r.viewers, r.gift, r.score, r.events,
          r.debut || '', monthKey + '|' + r.id, stamp];
      }));
  });
  const all = kept.concat(fresh);
  all.sort(function (a, b) { return Number(a[0]) - Number(b[0]); }); // 安定ソート：同じ月の並びは保つ

  ensureRows_(sheet, all.length + 1);
  if (last >= 2) sheet.getRange(2, 1, last - 1, width).clearContent();
  if (all.length) {
    sheet.getRange(2, 2, all.length, 3).setNumberFormat('@');
    sheet.getRange(2, 1, all.length, width).setValues(all);
    sheet.getRange(2, 11, all.length, 1).setNumberFormat('yyyy/mm/dd');
  }
}

/**
 * タレントマスタ：新しいIDを追加し、配信者名を最新に更新。
 * 担当者は records に owner があり、シート側が空欄のときだけ埋める（メモは触らない）
 */
function upsertMaster_(ss, records) {
  const sheet = ss.getSheetByName(SHEET.master);
  const last = Math.max(sheet.getLastRow(), MASTER_FIRST_ROW - 1);
  const n = last - MASTER_FIRST_ROW + 1;
  const cur = n > 0 ? sheet.getRange(MASTER_FIRST_ROW, 1, n, 3).getValues() : [];
  const rowById = {};
  let lastIdRow = MASTER_FIRST_ROW - 1;
  cur.forEach(function (r, i) {
    const id = String(r[0]).trim();
    if (!id) return;
    rowById[id] = i;
    lastIdRow = MASTER_FIRST_ROW + i;
  });

  let namesChanged = false;
  let ownersChanged = false;
  const added = [];
  const addedAt = {};
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd');
  records.forEach(function (r) {
    if (r.id in addedAt) {
      const a = added[addedAt[r.id]];
      if (r.name) a[1] = r.name;
      if (r.owner && !a[2]) a[2] = r.owner;
    } else if (r.id in rowById) {
      const row = cur[rowById[r.id]];
      if (r.name && row[1] !== r.name) {
        row[1] = r.name;
        namesChanged = true;
      }
      if (r.owner && String(row[2]).trim() === '') {
        row[2] = r.owner;
        ownersChanged = true;
      }
    } else {
      addedAt[r.id] = added.length;
      added.push([r.id, r.name, r.owner || '', '', today]);
    }
  });
  if (namesChanged) {
    sheet.getRange(MASTER_FIRST_ROW, 2, cur.length, 1).setNumberFormat('@').setValues(cur.map(function (r) { return [r[1]]; }));
  }
  if (ownersChanged) {
    sheet.getRange(MASTER_FIRST_ROW, 3, cur.length, 1).setValues(cur.map(function (r) { return [r[2]]; }));
  }
  if (added.length) {
    ensureRows_(sheet, lastIdRow + added.length);
    sheet.getRange(lastIdRow + 1, 1, added.length, 2).setNumberFormat('@');
    sheet.getRange(lastIdRow + 1, 1, added.length, 5).setValues(added);
  }
}

/** ティア判定のA列（ID）を、月次RAWの最新月の在籍者（売上順）に入れ替える */
function updateJudgeRoster_(ss) {
  const idx = buildMonthlyIndex_(readMonthlyRows_(ss));
  const latest = idx.months[idx.months.length - 1];
  if (!latest) return '';
  const ids = idx.idsByMonth[latest].slice().sort(function (a, b) {
    return stat_(idx, latest, b).gift - stat_(idx, latest, a).gift;
  });
  const sheet = ss.getSheetByName(SHEET.judge);
  const out = [];
  for (let i = 0; i < JUDGE_FORMULA_ROWS; i++) out.push([ids[i] || '']);
  sheet.getRange(JUDGE_FIRST_ROW, 1, JUDGE_FORMULA_ROWS, 1).setNumberFormat('@').setValues(out);
  return ids.length > JUDGE_FORMULA_ROWS
    ? '在籍' + ids.length + '人が' + JUDGE_FORMULA_ROWS + '行を超えています。ティア判定・週次KPIの行を増やしてください'
    : '';
}

function appendLog_(ss, fileId, fileName, targetDate, rows, result) {
  const sheet = ss.getSheetByName(SHEET.log);
  sheet.appendRow([new Date(), fileId, fileName, targetDate || '', rows, result]);
}

/** 取込ログから「エラー以外で処理済み」のファイルIDを集める（エラーのファイルは次回再挑戦） */
function importedFileIds_(ss) {
  const sheet = ss.getSheetByName(SHEET.log);
  const last = sheet.getLastRow();
  const done = {};
  if (last < 2) return done;
  sheet.getRange(2, 2, last - 1, 5).getValues().forEach(function (r) {
    if (r[0] && String(r[4]).indexOf('エラー') !== 0) done[String(r[0])] = true;
  });
  return done;
}

// ===== 表示の更新 ==========================================================

function refreshAll_(ss) {
  SpreadsheetApp.flush(); // 設定シートの評価月などの数式を最新にしてから読む
  renderTierHistory_(ss);
  const sheet = ss.getSheetByName(SHEET.byMonth);
  const month = sheet ? parseMonthLabel_(sheet.getRange('B3').getValue()) : null;
  renderMonthlyView_(ss, month);
}

function refreshMonthlyView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.byMonth);
  renderMonthlyView_(ss, sheet ? parseMonthLabel_(sheet.getRange('B3').getValue()) : null);
  if (sheet) sheet.activate();
}

function refreshTierHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  renderTierHistory_(ss);
  ss.getSheetByName(SHEET.history).activate();
}

/** ティア推移：月次RAWの全月を、設定シートの基準で各月を評価月として再判定 */
function renderTierHistory_(ss) {
  const cfg = readConfig_(ss);
  const idx = buildMonthlyIndex_(readMonthlyRows_(ss));
  const months = idx.months;
  if (!months.length) return;
  const nowYm = ym_(new Date());
  const labels = months.map(function (m) { return monthLabel_(m) + (m >= nowYm ? '（途中）' : ''); });
  const tiersByMonth = months.map(function (m) { return judgeMonth_(idx, m, cfg); });

  const sheet = getOrCreateSheet_(ss, SHEET.history);
  sheet.clear();
  sheet.clearConditionalFormatRules();

  sheet.getRange('A1').setValue('ティア推移（設定シートの基準で全月を自動再判定）').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2').setValue(
    '各月をその月の評価月として判定した結果。取込のたびに自動更新されます。空欄＝その月は在籍データなし。基準：月' +
      cfg.hours + 'h・イベント' + cfg.events + '回'
  );

  // 上段：人数
  const top = [['月'].concat(labels)];
  TIERS.forEach(function (t) {
    top.push([t].concat(tiersByMonth.map(function (res) {
      return res.filter(function (x) { return x.tier === t; }).length;
    })));
  });
  top.push(['合計'].concat(tiersByMonth.map(function (res) { return res.length; })));
  sheet.getRange(4, 1, top.length, top[0].length).setNumberFormat('@').setValues(top);
  sheet.getRange(5, 2, top.length - 1, months.length).setNumberFormat('0');
  styleHeader_(sheet.getRange(4, 1, 1, top[0].length));
  sheet.getRange(4 + top.length - 1, 1, 1, top[0].length).setFontWeight('bold');
  TIERS.forEach(function (t, i) { sheet.getRange(5 + i, 1).setBackground(TIER_COLOR[t]).setFontWeight('bold'); });

  // 下段：タレント別
  const evalMonth = cfg.evalMonth && months.indexOf(cfg.evalMonth) >= 0 ? cfg.evalMonth : months[months.length - 1];
  const evalPos = months.indexOf(evalMonth);
  const tierAt = months.map(function (_, i) {
    const map = {};
    tiersByMonth[i].forEach(function (x) { map[x.id] = x; });
    return map;
  });
  const allIds = Object.keys(idx.latestName);
  allIds.sort(function (a, b) {
    const xa = tierAt[evalPos][a];
    const xb = tierAt[evalPos][b];
    const ra = xa ? tierRank_(xa.tier) : 99;
    const rb = xb ? tierRank_(xb.tier) : 99;
    if (ra !== rb) return ra - rb;
    return (xb ? xb.sales : -1) - (xa ? xa.sales : -1);
  });
  const headRow = 4 + top.length + 1;
  const evalLabel = (evalMonth % 100) + '月ティア（評価月）';
  const body = [['配信者名', 'ID'].concat(labels, [evalLabel])];
  allIds.forEach(function (id) {
    const row = [displayName_(idx, id), id];
    months.forEach(function (_, i) { row.push(tierAt[i][id] ? tierAt[i][id].tier : ''); });
    row.push(tierAt[evalPos][id] ? tierAt[evalPos][id].tier : '');
    body.push(row);
  });
  sheet.getRange(headRow, 1, body.length, body[0].length).setNumberFormat('@').setValues(body);
  styleHeader_(sheet.getRange(headRow, 1, 1, body[0].length));
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 210);
  applyTierColors_(sheet, sheet.getRange(headRow + 1, 3, Math.max(body.length - 1, 1), body[0].length - 2));
}

/**
 * 月別ティア／月別ティア明細：選んだ月を評価月としてティア判定し、ティア別メンバーを表示
 * @param {number|null} month yyyymm（null なら設定シートの評価月）
 */
function renderMonthlyView_(ss, month) {
  const cfg = readConfig_(ss);
  const idx = buildMonthlyIndex_(readMonthlyRows_(ss));
  const months = idx.months;
  if (!months.length) return;
  if (!month || months.indexOf(month) < 0) {
    month = cfg.evalMonth && months.indexOf(cfg.evalMonth) >= 0 ? cfg.evalMonth : months[months.length - 1];
  }
  const prevMonth = addMonths_(month, -1);
  const result = judgeMonth_(idx, month, cfg);
  const prevMap = {};
  if (months.indexOf(prevMonth) >= 0) {
    judgeMonth_(idx, prevMonth, cfg).forEach(function (x) { prevMap[x.id] = x.tier; });
  }
  const owners = readOwners_(ss);
  result.forEach(function (x) {
    x.prevTier = prevMap[x.id] || '';
    x.change = tierChange_(x.prevTier, x.tier);
    x.owner = owners[x.id] || '';
  });
  result.sort(function (a, b) {
    const d = tierRank_(a.tier) - tierRank_(b.tier);
    return d !== 0 ? d : b.sales - a.sales;
  });

  renderBoard_(ss, idx, cfg, month, prevMonth, prevMap, result);
  renderDetail_(ss, idx, month, result);
}

function renderBoard_(ss, idx, cfg, month, prevMonth, prevMap, result) {
  const sheet = getOrCreateSheet_(ss, SHEET.byMonth);
  const nowYm = ym_(new Date());
  const labels = idx.months.slice().reverse().map(monthLabel_);

  // 1〜3行目：タイトルと月の選択（B3）
  sheet.getRange(4, 1, Math.max(sheet.getMaxRows() - 3, 1), sheet.getMaxColumns()).breakApart().clear();
  sheet.getRange('A1').setValue('月別ティア（B3で月を選ぶと切り替わります）').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2').setValue(
    '選んだ月を評価月として、設定シートの基準（月' + cfg.hours + 'h・イベント' + cfg.events +
      '回など）で判定。前月＝前月を評価月にしたときのティア。明細は「' + SHEET.byMonthDetail + '」シート'
  );
  sheet.getRange('A3').setValue('表示する月：').setFontWeight('bold');
  const pick = sheet.getRange('B3');
  pick.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(labels, true).build());
  pick.setNumberFormat('@').setValue(monthLabel_(month)).setBackground('#FFF2CC').setFontWeight('bold').setFontColor('#1155CC');
  sheet.getRange('C3').setValue(month >= nowYm ? '※今月は途中経過の数値です' : '').setFontColor('#CC0000');

  // 5〜9行目：人数サマリー
  const prevCount = {};
  Object.keys(prevMap).forEach(function (id) { prevCount[prevMap[id]] = (prevCount[prevMap[id]] || 0) + 1; });
  const hasPrev = Object.keys(prevMap).length > 0;
  const count = {};
  result.forEach(function (x) { count[x.tier] = (count[x.tier] || 0) + 1; });
  const summary = [
    ['ティア'].concat(TIERS, ['合計']),
    ['人数（' + monthLabel_(month) + '）'].concat(TIERS.map(function (t) { return count[t] || 0; }), [result.length]),
    ['前月（' + monthLabel_(prevMonth) + '）'].concat(
      TIERS.map(function (t) { return hasPrev ? prevCount[t] || 0 : ''; }),
      [hasPrev ? Object.keys(prevMap).length : '']
    ),
    ['増減'].concat(
      TIERS.map(function (t) { return hasPrev ? (count[t] || 0) - (prevCount[t] || 0) : ''; }),
      [hasPrev ? result.length - Object.keys(prevMap).length : '']
    ),
  ];
  sheet.getRange(5, 1, summary.length, summary[0].length).setValues(summary);
  sheet.getRange(8, 2, 1, summary[0].length - 1).setNumberFormat('+0;-0;0');
  styleHeader_(sheet.getRange(5, 1, 1, summary[0].length));
  TIERS.forEach(function (t, i) { sheet.getRange(5, 2 + i).setBackground(TIER_COLOR[t]).setFontColor('#000000'); });
  sheet.getRange(6, 1, 3, 1).setFontWeight('bold');
  const moves = { 昇格: 0, 降格: 0, 新規: 0 };
  result.forEach(function (x) { if (x.change in moves) moves[x.change]++; });
  sheet.getRange(9, 1).setValue(
    hasPrev ? '前月からの移動：昇格 ' + moves['昇格'] + '人 ／ 降格 ' + moves['降格'] + '人 ／ 新規 ' + moves['新規'] + '人' : '前月のデータはありません'
  );

  // 11行目〜：ティア別メンバー（タレント分けと同じ並び。1ティア＝No.／配信者名／売上／前月 ＋ 空き列）
  const top = 11;
  const groupWidth = 5;
  const byTier = {};
  TIERS.forEach(function (t) { byTier[t] = []; });
  result.forEach(function (x) { byTier[x.tier].push(x); });
  const maxLen = Math.max(1, Math.max.apply(null, TIERS.map(function (t) { return byTier[t].length; })));
  const width = TIERS.length * groupWidth - 1;
  const grid = [];
  for (let r = 0; r < maxLen + 3; r++) grid.push(new Array(width).fill(''));
  TIERS.forEach(function (t, g) {
    const c = g * groupWidth;
    grid[0][c] = t + '｜' + byTier[t].length + '人';
    grid[1][c] = TIER_DESC[t];
    grid[2][c] = 'No.';
    grid[2][c + 1] = '配信者名';
    grid[2][c + 2] = '売上（円）';
    grid[2][c + 3] = '前月';
    if (!byTier[t].length) grid[3][c + 1] = '該当者なし';
    byTier[t].forEach(function (x, i) {
      grid[3 + i][c] = i + 1;
      grid[3 + i][c + 1] = x.name;
      grid[3 + i][c + 2] = Math.round(x.sales);
      grid[3 + i][c + 3] = changeMark_(x);
    });
  });
  ensureRows_(sheet, top + grid.length);
  ensureCols_(sheet, width);
  sheet.getRange(top, 1, grid.length, width).setNumberFormat('@').setValues(grid);
  TIERS.forEach(function (t, g) {
    const c = 1 + g * groupWidth;
    sheet.getRange(top, c, 1, 4).merge().setBackground(TIER_COLOR[t]).setFontWeight('bold').setFontSize(12);
    sheet.getRange(top + 1, c, 1, 4).merge().setFontSize(9).setFontColor('#666666').setWrap(true);
    styleHeader_(sheet.getRange(top + 2, c, 1, 4));
    sheet.getRange(top + 3, c + 2, maxLen, 1).setNumberFormat('#,##0');
    sheet.setColumnWidth(c, 36);
    sheet.setColumnWidth(c + 1, 200);
    sheet.setColumnWidth(c + 2, 90);
    sheet.setColumnWidth(c + 3, 70);
    if (g < TIERS.length - 1) sheet.setColumnWidth(c + 4, 16);
  });
  sheet.setColumnWidth(1, 120); // A列は「表示する月：」ラベルも兼ねる
  sheet.setFrozenRows(0);
}

function renderDetail_(ss, idx, month, result) {
  const sheet = getOrCreateSheet_(ss, SHEET.byMonthDetail);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.getRange('A1').setValue('月別ティア明細').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2').setValue(
    '表示中の月：' + monthLabel_(month) + '（「' + SHEET.byMonth + '」シートのB3で切り替え）。フィルタで担当者・ティアの絞り込みができます'
  );
  const head = [
    'ID', '配信者名', '担当者', 'ティア', '前月ティア', '変化', 'REALITYランク', '初配信日', 'デビュー月', '経過月数',
    '配信時間（h）', 'イベント数', '売上（円）', '1ヶ月前 売上（円）', '2ヶ月前 売上（円）', '3ヶ月平均 売上（円）',
    '基本条件', '初月 配信時間（h）', '初月 イベント数', 'デビュー3ヶ月内の最高月売上', '直近3ヶ月の最高月売上',
    '判定理由', '次のティアまで', '会社売上',
  ];
  const rows = result.map(function (x) {
    return [
      x.id, x.name, x.owner, x.tier, x.prevTier, x.change, x.rank, x.debutDate, x.debutMonth, x.elapsed,
      round_(x.hours), x.events, Math.round(x.sales), Math.round(x.sales1), Math.round(x.sales2), Math.round(x.avg3),
      x.basic ? '◯' : '✕', x.firstHours === '' ? '' : round_(x.firstHours), x.firstEvents,
      x.debutMax === '' ? '' : Math.round(x.debutMax), Math.round(x.recentMax),
      x.reason, x.next, Math.round(x.company),
    ];
  });
  const table = [head].concat(rows);
  ensureRows_(sheet, 4 + table.length);
  ensureCols_(sheet, head.length);
  sheet.getRange(4, 1, table.length, 6).setNumberFormat('@');
  sheet.getRange(4, 22, table.length, 2).setNumberFormat('@');
  sheet.getRange(4, 1, table.length, head.length).setValues(table);
  styleHeader_(sheet.getRange(4, 1, 1, head.length));
  if (rows.length) {
    sheet.getRange(5, 13, rows.length, 4).setNumberFormat('#,##0');
    sheet.getRange(5, 20, rows.length, 2).setNumberFormat('#,##0');
    sheet.getRange(5, 24, rows.length, 1).setNumberFormat('#,##0');
    applyTierColors_(sheet, sheet.getRange(5, 4, rows.length, 2));
  }
  sheet.getRange(4, 1, table.length, head.length).createFilter();
  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(2);
  sheet.setColumnWidth(2, 220);
}

// ===== ティア判定ロジック（ティア判定シートの数式と同じ判定） =================

/**
 * 月次RAWの行から検索用の索引を作る
 * rows: [月キー, ID, 配信者名, ランク, 配信回数, 配信時間, 視聴者数, ギフト, スコア, イベント, 初配信日, ...]
 */
function buildMonthlyIndex_(rows) {
  const idx = { stat: {}, rank: {}, debut: {}, debutDate: {}, idsByMonth: {}, months: [], latestName: {}, latestMonth: {} };
  rows.forEach(function (r) {
    const m = Number(r[0]);
    const id = String(r[1] == null ? '' : r[1]).trim();
    if (!m || !id) return;
    const key = m + '|' + id;
    const s = idx.stat[key] || (idx.stat[key] = { hours: 0, events: 0, gift: 0 });
    s.hours += num_(r[5]);
    s.events += num_(r[9]);
    s.gift += num_(r[7]);
    if (!(key in idx.rank)) idx.rank[key] = r[3] == null ? '' : r[3];
    // ティア判定シートと同じく「IDの最初の行」の初配信日を使う
    if (!(id in idx.debut)) {
      const d = parseDate_(r[10]);
      idx.debut[id] = d ? ym_(d) : '';
      idx.debutDate[id] = d ? fmtDate_(d) : '';
    }
    if (!idx.idsByMonth[m]) {
      idx.idsByMonth[m] = [];
      idx.months.push(m);
    }
    if (idx.idsByMonth[m].indexOf(id) < 0) idx.idsByMonth[m].push(id);
    if (!(id in idx.latestMonth) || m >= idx.latestMonth[id]) {
      idx.latestMonth[id] = m;
      idx.latestName[id] = r[2] == null ? '' : String(r[2]);
    }
  });
  idx.months.sort(function (a, b) { return a - b; });
  return idx;
}

/** 評価月 evalMonth に在籍（月次RAWに行がある）全員を判定 */
function judgeMonth_(idx, evalMonth, cfg) {
  return (idx.idsByMonth[evalMonth] || []).map(function (id) {
    return judgeTalent_(idx, id, evalMonth, cfg);
  });
}

function judgeTalent_(idx, id, ev, cfg) {
  const F = idx.debut[id] || '';
  const G = F === '' ? '' : monthDiff_(ev, F);
  const cur = stat_(idx, ev, id);
  const H = cur.hours;
  const I = cur.events;
  const J = cur.gift;
  const K = stat_(idx, addMonths_(ev, -1), id).gift;
  const L = stat_(idx, addMonths_(ev, -2), id).gift;
  const M = (J + K + L) / 3;
  const basic = H >= cfg.hours && I >= cfg.events;
  const O = F === '' ? '' : stat_(idx, F, id).hours;
  const P = F === '' ? '' : stat_(idx, F, id).events;
  const Q = F === '' ? '' : Math.max.apply(null, [0, 1, 2].map(function (k) {
    const m = addMonths_(F, k);
    return m > ev ? 0 : stat_(idx, m, id).gift;
  }));
  const R = Math.max(J, K, L);

  let tier;
  if (basic && M >= cfg.t1) tier = 'T1';
  else if (basic && M >= cfg.t2) tier = 'T2';
  else if (F !== '' && G < 0) tier = '未評価';
  else if (F !== '' && Q >= cfg.t3) tier = 'T3';
  else if (cfg.rescue && (F === '' || G >= 3) && R >= cfg.t3) tier = 'T3';
  else if (F !== '' && G <= 2 && O >= cfg.hours && P >= cfg.events) tier = 'T4';
  else tier = 'T5';

  let reason;
  if (tier === 'T1') reason = '基本条件◯・3ヶ月平均' + man_(cfg.t1) + '以上';
  else if (tier === 'T2') reason = '基本条件◯・3ヶ月平均' + man_(cfg.t2) + '以上';
  else if (tier === '未評価') reason = '評価月より後にデビュー';
  else if (tier === 'T3') reason = F !== '' && Q >= cfg.t3 ? 'デビュー3ヶ月以内に月' + man_(cfg.t3) + '達成' : '直近3ヶ月に月' + man_(cfg.t3) + '達成（救済）';
  else if (tier === 'T4') reason = '初月条件◯・' + man_(cfg.t3) + '達成待ち';
  else reason = F !== '' && G <= 2 ? '初月条件✕（' + cfg.hours + 'h・イベント' + cfg.events + '回）' : '3ヶ月以内に月' + man_(cfg.t3) + '未達';

  const lack = basic ? '' : '・基本条件';
  let next;
  if (tier === 'T1') next = '維持';
  else if (tier === 'T2') next = '3ヶ月平均あと' + yen_(Math.max(0, cfg.t1 - M)) + '円' + lack;
  else if (tier === 'T3') next = '3ヶ月平均あと' + yen_(Math.max(0, cfg.t2 - M)) + '円' + lack;
  else if (tier === 'T4') next = '月' + man_(cfg.t3) + 'まであと' + yen_(Math.max(0, cfg.t3 - J)) + '円（期限：' + addMonths_(F, 2) + '）';
  else if (tier === '未評価') next = '翌月に判定';
  else next = '月' + cfg.hours + 'h・イベント' + cfg.events + '回・月' + man_(cfg.t3) + 'を目指す';

  return {
    id: id,
    name: displayName_(idx, id),
    rank: idx.rank[ev + '|' + id] || '',
    debutDate: idx.debutDate[id] || '',
    debutMonth: F,
    elapsed: G,
    hours: H,
    events: I,
    sales: J,
    sales1: K,
    sales2: L,
    avg3: M,
    basic: basic,
    firstHours: O,
    firstEvents: P,
    debutMax: Q,
    recentMax: R,
    tier: tier,
    reason: reason,
    next: next,
    company: J * cfg.rate,
  };
}

function stat_(idx, month, id) {
  return idx.stat[month + '|' + id] || { hours: 0, events: 0, gift: 0 };
}

function tierRank_(t) {
  const i = TIERS.indexOf(t);
  return i < 0 ? 99 : i;
}

function tierChange_(prev, cur) {
  if (!prev) return '新規';
  if (prev === '未評価' || cur === '未評価') return '—';
  const d = tierRank_(cur) - tierRank_(prev);
  return d < 0 ? '昇格' : d > 0 ? '降格' : '維持';
}

function changeMark_(x) {
  if (x.change === '新規') return '新規';
  if (x.change === '昇格') return x.prevTier + '↑';
  if (x.change === '降格') return x.prevTier + '↓';
  return x.prevTier;
}

// ===== CSV の読み取り ======================================================

/** REALITYのCSVテキストを [{id, name, rank, count, hours, viewers, gift, score, events, debut}] にする */
function parseRealityCsv_(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.indexOf('\t') >= 0 && firstLine.indexOf(',') < 0 ? '\t' : ',';
  const rows = parseCsvText_(text, delimiter).filter(function (r) {
    return r.some(function (c) { return String(c).trim() !== ''; });
  });

  // 先頭に説明行があっても、列名の行を探す
  let headerAt = -1;
  let col = null;
  for (let i = 0; i < Math.min(rows.length, 10) && headerAt < 0; i++) {
    const found = findColumns_(rows[i]);
    if (REQUIRED_COLUMNS.every(function (k) { return found[k] >= 0; })) {
      headerAt = i;
      col = found;
    }
  }
  if (headerAt < 0) {
    const found = findColumns_(rows[0] || []);
    const missing = REQUIRED_COLUMNS.filter(function (k) { return found[k] < 0; })
      .map(function (k) { return COLUMN_ALIASES[k][0]; });
    throw new Error('列が見つかりません：' + missing.join('・') + '（CSVの列：' + (rows[0] || []).join(' / ') +
      '）。スクリプト先頭の COLUMN_ALIASES に列名を追加してください');
  }
  const header = rows[headerAt];
  const hoursHeader = String(header[col.hours]);

  const byId = {};
  const order = [];
  rows.slice(headerAt + 1).forEach(function (r) {
    const id = cell_(r, col.id);
    if (!id) return; // 合計行など
    const d = col.debut >= 0 ? parseDate_(cell_(r, col.debut)) : null;
    const rec = {
      id: id,
      name: cell_(r, col.name),
      rank: cell_(r, col.rank),
      count: num_(cell_(r, col.count)),
      hours: parseHours_(cell_(r, col.hours), hoursHeader),
      viewers: num_(cell_(r, col.viewers)),
      gift: num_(cell_(r, col.gift)),
      score: num_(cell_(r, col.score)),
      events: countEvents_(cell_(r, col.events)),
      debut: d ? fmtDate_(d) : '',
    };
    if (!(id in byId)) order.push(id);
    byId[id] = rec;
  });
  return order.map(function (id) { return byId[id]; });
}

function findColumns_(headerRow) {
  const norm = headerRow.map(normHeader_);
  const out = {};
  Object.keys(COLUMN_ALIASES).forEach(function (k) {
    out[k] = -1;
    COLUMN_ALIASES[k].some(function (alias) {
      const i = norm.indexOf(normHeader_(alias));
      if (i >= 0) out[k] = i;
      return i >= 0;
    });
  });
  return out;
}

function normHeader_(s) {
  return String(s == null ? '' : s)
    .replace(/^\uFEFF/, '')
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
    .replace(/[\s　"']/g, '')
    .toLowerCase();
}

function cell_(row, i) {
  return i >= 0 && i < row.length ? String(row[i] == null ? '' : row[i]).trim() : '';
}

/** 配信時間：数値（時間）、"h:mm:ss"、"1時間23分" に対応。列名に（分）（秒）があれば換算 */
function parseHours_(v, header) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return round_(Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600);
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*時間)?\s*(?:(\d+(?:\.\d+)?)\s*分)?\s*(?:(\d+(?:\.\d+)?)\s*秒)?$/);
  if (m && (m[1] || m[2] || m[3])) return round_(Number(m[1] || 0) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600);
  const n = num_(s);
  const h = normHeader_(header);
  if (/分|min/.test(h)) return round_(n / 60);
  if (/秒|sec/.test(h)) return round_(n / 3600);
  return n;
}

/** イベント数：数値ならそのまま。イベント名の一覧なら件数を数える */
function countEvents_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === '-' || s === '—' || s === 'なし') return 0;
  if (/^\d+(\.\d+)?\s*(件|回)?$/.test(s)) return parseFloat(s);
  return s.split(/[\r\n,、，;；|｜]+/).filter(function (x) { return x.trim() !== ''; }).length;
}

/** RFC 4180 形式のCSVを2次元配列にする（"" のエスケープ・セル内改行に対応） */
function parseCsvText_(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readBlobText_(blob) {
  let text = blob.getDataAsString('UTF-8');
  if (text.indexOf('\uFFFD') >= 0) text = blob.getDataAsString('Shift_JIS');
  return text;
}

/** "streamer_20261001_20261005.csv" → {start, end} */
function periodFromFileName_(name) {
  const m = String(name).match(/(\d{8})\D+(\d{8})/);
  if (!m) return null;
  const s = parseDate_(m[1]);
  const e = parseDate_(m[2]);
  return s && e ? { start: s, end: e } : null;
}

function periodSortKey_(name, start, end) {
  const p = start && end ? { start: parseDate_(start), end: parseDate_(end) } : periodFromFileName_(name);
  return p && p.start && p.end ? ymd_(p.start) + '_' + ymd_(p.end) + '_' + name : '99999999_' + name;
}

// ===== 小物 ================================================================

function readMonthlyRows_(ss) {
  const sheet = ss.getSheetByName(SHEET.monthly);
  const last = sheet.getLastRow();
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, 11).getValues();
}

function readConfig_(ss) {
  const s = ss.getSheetByName(SHEET.settings);
  const v = s.getRange('B5:B16').getValues().map(function (r) { return r[0]; });
  return {
    rate: num_(v[0]),
    evalMonth: Number(v[3]) || null,
    hours: num_(v[6]),
    events: num_(v[7]),
    t1: num_(v[8]),
    t2: num_(v[9]),
    t3: num_(v[10]),
    rescue: String(v[11]).trim().toUpperCase() === 'ON',
  };
}

function readOwners_(ss) {
  const sheet = ss.getSheetByName(SHEET.master);
  const last = sheet.getLastRow();
  const out = {};
  if (last < MASTER_FIRST_ROW) return out;
  sheet.getRange(MASTER_FIRST_ROW, 1, last - MASTER_FIRST_ROW + 1, 3).getValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = String(r[2] || '');
  });
  return out;
}

function displayName_(idx, id) {
  return idx.latestName[id] || id;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureRows_(sheet, lastRow) {
  const max = sheet.getMaxRows();
  if (lastRow > max) sheet.insertRowsAfter(max, lastRow - max);
}

function ensureCols_(sheet, lastCol) {
  const max = sheet.getMaxColumns();
  if (lastCol > max) sheet.insertColumnsAfter(max, lastCol - max);
}

function styleHeader_(range) {
  range.setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
}

function applyTierColors_(sheet, range) {
  const rules = sheet.getConditionalFormatRules();
  TIERS.forEach(function (t) {
    if (t === '未評価') return;
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(TIER_COLOR[t]).setRanges([range]).build());
  });
  sheet.setConditionalFormatRules(rules);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5 * 60 * 1000)) throw new Error('別の取込が実行中です。しばらくしてから再実行してください');
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

function notify_(msg) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'REALITY取込', 8);
  } catch (e) {
    console.log(msg);
  }
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function parseDate_(v) {
  if (isDate_(v)) return v;
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function ym_(d) {
  return d.getFullYear() * 100 + d.getMonth() + 1;
}

function ymd_(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function fmtDate_(d) {
  return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2);
}

function addMonths_(ym, k) {
  const total = Math.floor(ym / 100) * 12 + (ym % 100) - 1 + k;
  return Math.floor(total / 12) * 100 + (total % 12) + 1;
}

function monthDiff_(a, b) {
  return (Math.floor(a / 100) - Math.floor(b / 100)) * 12 + (a % 100) - (b % 100);
}

function monthLabel_(ym) {
  return Math.floor(ym / 100) + '年' + ('0' + (ym % 100)).slice(-2) + '月';
}

function parseMonthLabel_(v) {
  if (isDate_(v)) return ym_(v);
  const s = String(v == null ? '' : v);
  let m = s.match(/(\d{4})\D+(\d{1,2})/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = s.match(/^(\d{4})(\d{2})$/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v == null ? '' : v).replace(/[¥￥,，円\s]/g, ''));
  return isFinite(n) ? n : 0;
}

function round_(n) {
  return Math.round(n * 10000) / 10000;
}

function yen_(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function man_(n) {
  return n % 10000 === 0 ? n / 10000 + '万' : yen_(n) + '円';
}

// ===== アップロード用ダイアログ =============================================

const UPLOAD_HTML_ = [
  '<style>',
  'body{font-family:sans-serif;font-size:13px;margin:0;padding:4px 8px;color:#222}',
  'table{border-collapse:collapse;width:100%;margin-top:8px}td{padding:3px 4px;border-bottom:1px solid #eee}',
  'input[type=date]{width:130px}button{margin-top:12px;padding:6px 16px;font-size:13px}',
  '#log{margin-top:10px;white-space:pre-wrap;font-size:12px}.err{color:#c00}',
  '</style>',
  '<div>REALITYからダウンロードしたCSVを選んでください（複数可）。期間はファイル名',
  '（streamer_開始日_終了日.csv）から自動で入ります。違う場合は書き換えてください。</div>',
  '<input type="file" id="f" accept=".csv,.tsv,.txt" multiple style="margin-top:8px">',
  '<table id="t"></table>',
  '<button id="go" disabled>取り込む</button>',
  '<div id="log"></div>',
  '<script>',
  'var items=[];',
  'function iso(s){return s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8);}',
  'function decode(buf){try{return new TextDecoder("utf-8",{fatal:true}).decode(buf);}catch(e){return new TextDecoder("shift_jis").decode(buf);}}',
  'document.getElementById("f").onchange=function(e){',
  '  items=[];var t=document.getElementById("t");t.innerHTML="";',
  '  var files=[].slice.call(e.target.files);var left=files.length;',
  '  files.forEach(function(file,i){',
  '    var m=file.name.match(/(\\d{8})\\D+(\\d{8})/);',
  '    var tr=document.createElement("tr");',
  '    tr.innerHTML="<td>"+file.name.replace(/</g,"&lt;")+"</td><td><input type=date id=s"+i+"> 〜 <input type=date id=e"+i+"></td>";',
  '    t.appendChild(tr);',
  '    if(m){document.getElementById("s"+i).value=iso(m[1]);document.getElementById("e"+i).value=iso(m[2]);}',
  '    var r=new FileReader();',
  '    r.onload=function(){items[i]={name:file.name,text:decode(r.result)};if(--left===0)document.getElementById("go").disabled=false;};',
  '    r.readAsArrayBuffer(file);',
  '  });',
  '};',
  'document.getElementById("go").onclick=function(){',
  '  var payload=items.map(function(it,i){return {name:it.name,text:it.text,start:document.getElementById("s"+i).value,end:document.getElementById("e"+i).value};});',
  '  if(payload.some(function(p){return !p.start||!p.end;})){alert("期間（開始日・終了日）を入れてください");return;}',
  '  this.disabled=true;var log=document.getElementById("log");log.textContent="取込中…（数十秒かかることがあります）";',
  '  google.script.run.withSuccessHandler(function(msgs){log.textContent=msgs.join("\\n")+"\\n\\n完了しました。このウィンドウは閉じてOKです。";})',
  '    .withFailureHandler(function(err){log.innerHTML="<span class=err>"+String(err.message||err).replace(/</g,"&lt;")+"</span>";})',
  '    .importUploadedCsv(payload);',
  '};',
  '</script>',
].join('\n');

const APP_IMPORT_HTML_ = [
  '<style>',
  'body{font-family:sans-serif;font-size:13px;margin:0;padding:4px 8px;color:#222}',
  'button{margin-top:12px;padding:6px 16px;font-size:13px}#log{margin-top:10px;white-space:pre-wrap}.err{color:#c00}',
  '</style>',
  '<div>ティア判定アプリの「スプレッドシート用に書き出し」で保存したCSVを選んでください。',
  'CSVに入っている月を、月次RAWでまるごと置き換えます（担当者は、タレントマスタが空欄の人だけ埋めます）。</div>',
  '<input type="file" id="f" accept=".csv" style="margin-top:10px">',
  '<div><button id="go" disabled>取り込む</button></div>',
  '<div id="log"></div>',
  '<script>',
  'var file=null;',
  'document.getElementById("f").onchange=function(e){file=e.target.files[0];document.getElementById("go").disabled=!file;};',
  'document.getElementById("go").onclick=function(){',
  '  var btn=this,log=document.getElementById("log");btn.disabled=true;log.textContent="取込中…（1分ほどかかることがあります）";',
  '  var r=new FileReader();',
  '  r.onload=function(){',
  '    google.script.run.withSuccessHandler(function(msg){log.textContent=msg+"\\n\\n完了しました。このウィンドウは閉じてOKです。";})',
  '      .withFailureHandler(function(err){btn.disabled=false;log.innerHTML="<span class=err>"+String(err.message||err).replace(/</g,"&lt;")+"</span>";})',
  '      .importAppExport(file.name,r.result);',
  '  };',
  '  r.readAsText(file,"utf-8");',
  '};',
  '</script>',
].join('\n');
