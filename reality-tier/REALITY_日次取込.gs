// REALITY ティア判定：日次CSV取込・ティア自動判定・月別ティア表示
//
// スプレッドシート「REALITY_ティア判定_週次KPI」に貼り付けて使う Apps Script です。
//
//   ① 毎日：REALITY の CSV（月初からの累計）を取り込む
//        - ティア判定アプリで取り込むと、アプリがドライブのフォルダにCSVを置き、15分ごとに自動で取込
//        - または メニュー「REALITY取込 → CSVをアップロードして取込」から手動
//   ② 日次RAW に前回CSVとの差分（増分）を記録、月次RAW のその月を最新の累計で上書き
//   ③ タレントマスタに新しいタレントを追加、ティア判定の一覧を最新月の在籍者に更新
//      （ティア判定／タレント分け／サマリー／週次KPI はシートの数式で自動計算）
//   ④ 「ティア推移」を全月ぶん再判定し、「月別ティア」「月別ティア明細」を更新
//      （月別ティアのB3で月を選ぶと、その月のティア別メンバーに切り替わる）
//
// セットアップ手順は同じフォルダの README.md を参照してください。

// ===== 設定（ここだけ書き換える） ==========================================

/**
 * CSVが届くGoogleドライブのフォルダID（URLの folders/ の後ろ）。
 * ティア判定アプリでCSVを取り込むと、アプリがこのフォルダにCSVを置き、ここから自動で取り込まれる。
 */
const FOLDER_ID = '1XUUQopVjWOikkU2_QS9glZZN7NhzLQIc';

/** フォルダを見に行く間隔（分）。1・5・10・15・30 のどれか */
const CHECK_MINUTES = 15;

/**
 * REALITYティア判定ダッシュボード（Vercel）との合言葉。推測されにくい長い英数字に書き換える。
 * ダッシュボードの環境変数 GAS_TOKEN にも同じものを設定する。
 */
const TOKEN = 'ここを長い合言葉に書き換える';

/**
 * CSVの列名の候補。REALITYのCSVの列名が変わったら、ここに列名を追加してください。
 * 左から順に探し、最初に見つかった列を使います（全角/半角・空白・大文字小文字の違いは無視）。
 */
const COLUMN_ALIASES = {
  id: ['ID', '配信者ID', 'ユーザーID', 'ユーザーId', 'streamer_id', 'user_id', 'userId'],
  name: ['配信者名', 'ユーザー名', '名前', 'ニックネーム', '表示名', 'name'],
  rank: ['REALITYランク', 'ランク', 'rank'],
  count: ['配信回数', '合計配信回数'],
  hours: ['合計配信時間（時）', '合計配信時間（h）', '配信時間（時）', '配信時間（h）', '合計配信時間', '配信時間'],
  viewers: ['視聴者数', '合計視聴者数', 'ユニーク視聴者数'],
  gift: ['合計ギフト金額', 'ギフト金額（円）', 'ギフト金額', '合計ギフト'],
  score: ['合計獲得スコア', '獲得スコア', 'スコア', '合計スコア'],
  events: ['参加中のイベント', 'イベント参加数', 'イベント数'],
  debut: ['初配信日', 'デビュー日'],
  bonus: ['今月のスコアボーナス金額', 'スコアボーナス金額', 'ボーナス金額', 'ボーナス売上'],
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
  affiliation: '所属ID',
  sales: '売上ダッシュボード',
};
/** 管理シート（アソビアライアンス マネジメント事業部 管理シート）：所属IDと過去のボーナスの取り込み元 */
const MANAGEMENT_SHEET_ID = '1Y6tuQBsquZydLi2QvtbigjGmMjNbcPTANKEVGW-WG1Y';
const AFFILIATIONS = ['東京', '大阪', 'MUSIC'];
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
    .addItem('売上ダッシュボードを更新', 'refreshSalesDashboard')
    .addItem('所属ID・過去のボーナスを管理シートから取り込む', 'importFromManagementSheet')
    .addSeparator()
    .addItem('自動取込（' + CHECK_MINUTES + '分ごと）を設定', 'setupTrigger')
    .addToUi();
}

/** 月別ティアのB3（表示する月）を変えたら表示を切り替える（シンプルトリガー） */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (e.range.getA1Notation() !== 'B3') return;
  if (sheet.getName() === SHEET.byMonth) renderMonthlyView_(e.source, parseMonthLabel_(e.range.getValue()));
  if (sheet.getName() === SHEET.sales) renderSalesDashboard_(e.source, parseMonthLabel_(e.range.getValue()));
}

/** CHECK_MINUTES 分ごとに dailyImport を実行するトリガーを登録（重複登録はしない） */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyImport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyImport').timeBased().everyMinutes(CHECK_MINUTES).create();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fixed = fixJudgeFormulas_(ss);
  notify_(CHECK_MINUTES + '分ごとの自動取込を設定しました。' + (fixed ? 'ティア判定の数式（11・12月デビューの3ヶ月目）も修正しました。' : ''));
  dailyImport(); // すでにフォルダにあるCSVをすぐ取り込む
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

// ===== ダッシュボード用の窓口（ウェブアプリ） ===============================
//
// 「デプロイ → 新しいデプロイ → ウェブアプリ」（実行ユーザー：自分／アクセス：全員）でデプロイし、
// 表示されたURLをダッシュボードの GAS_WEBAPP_URL に設定する。合言葉（TOKEN）がないリクエストは拒否する。

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!TOKEN || TOKEN.indexOf('ここを') === 0) return json_({ ok: false, error: 'スクリプトの TOKEN が未設定です' });
    if (req.token !== TOKEN) return json_({ ok: false, error: 'unauthorized' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (req.action) {
      case 'load':
        return json_(Object.assign({ ok: true }, apiLoad_(ss)));
      case 'import':
        return json_({ ok: true, messages: importUploadedCsv(req.files || []) });
      case 'saveTalent':
        withLock_(function () { saveTalent_(ss, String(req.id || ''), String(req.owner || ''), String(req.memo || '')); });
        return json_({ ok: true });
      case 'saveCriteria':
        withLock_(function () { saveCriteria_(ss, req.criteria || {}); });
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: 'unknown action: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ===== ティア判定アプリ（ウェブアプリの画面） ===============================
//
// 「デプロイ → 新しいデプロイ → ウェブアプリ」で
//   次のユーザーとして実行：自分 ／ アクセスできるユーザー：株式会社LIV 内の全員
// にすると、会社の Google アカウントでログインしている人だけが使えるアプリになる。
// 画面の中身は下の APP_HTML_（reality-tier/webapp/App.html から自動で埋め込み）。

function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return json_({ ok: true, message: 'REALITY ティア判定の窓口は動いています' });
  return HtmlService.createHtmlOutput(APP_HTML_)
    .setTitle('REALITY ティア判定')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 画面から呼ばれる：データ一式 */
function webLoad() {
  return apiLoad_(SpreadsheetApp.getActiveSpreadsheet());
}

/** 画面から呼ばれる：CSV取込。files: [{name, text, start, end}] → 「ファイル名：結果」の一覧 */
function webImport(files) {
  return importUploadedCsv(files || []);
}

/** 画面から呼ばれる：担当者・メモの保存 */
function webSaveTalent(id, owner, memo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  withLock_(function () { saveTalent_(ss, String(id || ''), String(owner || ''), String(memo || '')); });
  return true;
}

/** 画面から呼ばれる：判定基準の保存（設定シート） */
function webSaveCriteria(criteria) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  withLock_(function () { saveCriteria_(ss, criteria || {}); });
  return true;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** ダッシュボードに渡すデータ一式（日付は文字列にする） */
function apiLoad_(ss) {
  const str = function (v) { return isDate_(v) ? fmtDate_(v) : v === null || v === undefined ? '' : v; };
  const months = readMonthlyRows_(ss).filter(function (r) { return r[0] !== '' && r[1] !== ''; }).map(function (r) {
    return [Number(r[0]), String(r[1]).trim(), String(r[2]), String(r[3]), num_(r[4]), num_(r[5]), num_(r[6]), num_(r[7]), num_(r[8]), num_(r[9]), str(r[10])];
  });

  const periods = {};
  const daily = ss.getSheetByName(SHEET.daily);
  if (daily.getLastRow() >= 2) {
    daily.getRange(2, 2, daily.getLastRow() - 1, 2).getValues().forEach(function (r) {
      const s = parseDate_(r[0]);
      const e = parseDate_(r[1]);
      if (!s || !e) return;
      const m = ym_(s);
      if (!periods[m] || fmtDate_(e) > periods[m]) periods[m] = fmtDate_(e);
    });
  }

  const master = ss.getSheetByName(SHEET.master);
  const talents = master.getLastRow() >= MASTER_FIRST_ROW
    ? master.getRange(MASTER_FIRST_ROW, 1, master.getLastRow() - MASTER_FIRST_ROW + 1, 4).getValues()
        .filter(function (r) { return String(r[0]).trim() !== ''; })
        .map(function (r) { return [String(r[0]).trim(), String(r[1]), String(r[2]), String(r[3])]; })
    : [];

  const logSheet = ss.getSheetByName(SHEET.log);
  const logLast = logSheet.getLastRow();
  const log = logLast >= 2
    ? logSheet.getRange(Math.max(2, logLast - 19), 1, Math.min(20, logLast - 1), 6).getValues().reverse().map(function (r) {
        return [isDate_(r[0]) ? Utilities.formatDate(r[0], TZ, 'yyyy/MM/dd HH:mm') : String(r[0]), String(r[2]), str(r[3]), num_(r[4]), String(r[5])];
      })
    : [];

  return { months: months, periods: periods, talents: talents, criteria: readConfig_(ss), log: log, spreadsheetUrl: ss.getUrl() };
}

/** タレントマスタの担当者・メモを保存（いない人は行を足す） */
function saveTalent_(ss, id, owner, memo) {
  if (!id) throw new Error('ID がありません');
  const sheet = ss.getSheetByName(SHEET.master);
  const last = sheet.getLastRow();
  const ids = last >= MASTER_FIRST_ROW
    ? sheet.getRange(MASTER_FIRST_ROW, 1, last - MASTER_FIRST_ROW + 1, 1).getValues().map(function (r) { return String(r[0]).trim(); })
    : [];
  const i = ids.indexOf(id);
  if (i >= 0) {
    sheet.getRange(MASTER_FIRST_ROW + i, 3, 1, 2).setValues([[owner, memo]]);
  } else {
    const row = Math.max(last, MASTER_FIRST_ROW - 1) + 1;
    ensureRows_(sheet, row);
    sheet.getRange(row, 1).setNumberFormat('@');
    sheet.getRange(row, 1, 1, 5).setValues([[id, '', owner, memo, Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd')]]);
  }
}

/** 設定シートの判定基準を保存し、ティア推移・月別ティアを作り直す */
function saveCriteria_(ss, c) {
  const s = ss.getSheetByName(SHEET.settings);
  const n = function (v, name) {
    const x = Number(v);
    if (!isFinite(x) || x < 0) throw new Error(name + ' の値が不正です');
    return x;
  };
  s.getRange('B5').setValue(n(c.rate, '還元率'));
  s.getRange('B11:B16').setValues([
    [n(c.hours, '配信時間')], [n(c.events, 'イベント数')], [n(c.t1, 'T1')], [n(c.t2, 'T2')], [n(c.t3, 'T3')], [c.rescue ? 'ON' : 'OFF'],
  ]);
  refreshAll_(ss);
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
    if (prev.end && ymd_(period.end) < ymd_(prev.end)) {
      const msg = 'スキップ：取込済み（' + fmtDate_(prev.end) + 'まで）より古い期間';
      appendLog_(ss, fileId, fileName, targetDate, 0, msg);
      return { ok: false, message: msg };
    }
    if (prev.end && ymd_(period.end) === ymd_(prev.end)) {
      // 同じ期間をもう一度入れたとき：日次RAW（増分）は二重にしないが、月次RAWは入れ直す（ボーナスなどの列を後から足せるように）
      replaceMonthly_(ss, monthKey, records, fileName);
      upsertMaster_(ss, records);
      const msg = 'OK（同じ期間のため月次RAWだけ更新）';
      appendLog_(ss, fileId, fileName, targetDate, records.length, msg);
      return { ok: true, message: msg + '・' + records.length + '行' };
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
  const width = 14; // N列＝ボーナス金額
  ensureCols_(sheet, width);
  if (!sheet.getRange(1, 14).getValue()) sheet.getRange(1, 14).setValue('ボーナス金額');
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
          r.debut || '', monthKey + '|' + r.id, stamp, r.bonus || 0];
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
  // 1つが失敗しても残りは更新する（以前は途中で止まり、売上ダッシュボードが古いまま残ることがあった）
  const step = function (label, fn) {
    try {
      fn();
    } catch (e) {
      console.error(label + '：' + e);
      const log = ss.getSheetByName(SHEET.log);
      if (log) log.appendRow([new Date(), '', label, '', '', 'エラー：' + (e && e.message ? e.message : e)]);
    }
  };
  // ボーナスは管理シートの値を正とする（CSVの「今月のスコアボーナス金額」はスコアと合わない値が入ることがあるため）
  step('ボーナスを管理シートから取込', function () { importManagement_(ss, false); });
  step('ティア判定の数式', function () { fixJudgeFormulas_(ss); });
  SpreadsheetApp.flush(); // 設定シートの評価月などの数式を最新にしてから読む
  const sales = ss.getSheetByName(SHEET.sales);
  step('売上ダッシュボード', function () {
    renderSalesDashboard_(ss, sales ? parseMonthLabel_(sales.getRange('B3').getValue()) : null);
  });
  const sheet = ss.getSheetByName(SHEET.byMonth);
  step('月別ティア', function () { renderMonthlyView_(ss, sheet ? parseMonthLabel_(sheet.getRange('B3').getValue()) : null); });
  step('ティア推移', function () { renderTierHistory_(ss); });
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

// ===== 売上ダッシュボード（所属別：東京／大阪／MUSIC） =====================
//
// 「所属ID」シートの A列に大阪、B列に MUSIC の配信者IDを入れると、その人はその所属、それ以外は東京として集計する。
// 売上の考え方は管理シートと同じ：配信売上＝合計ギフト金額×還元率、TOTAL売上＝配信売上＋ボーナス金額。

function refreshSalesDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.sales);
  renderSalesDashboard_(ss, sheet ? parseMonthLabel_(sheet.getRange('B3').getValue()) : null);
  ss.getSheetByName(SHEET.sales).activate();
}

/** 所属IDシート（なければ作る）から {ID: 所属} を読む */
function readAffiliations_(ss) {
  let sheet = ss.getSheetByName(SHEET.affiliation);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.affiliation);
    sheet.getRange('A1:B1').setValues([['大阪の所属者ID', 'MUSICの所属者ID']]);
    styleHeader_(sheet.getRange('A1:B1'));
    sheet.getRange('D1').setValue('A列に大阪、B列にMUSICの配信者IDを1行に1人ずつ入れてください。どちらにもないIDは東京として集計します。');
    sheet.setColumnWidths(1, 2, 260);
    sheet.setFrozenRows(1);
  }
  const map = {};
  const last = sheet.getLastRow();
  if (last < 2) return map;
  sheet.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
    const osaka = String(r[0]).trim();
    const music = String(r[1]).trim();
    if (music) map[music] = 'MUSIC';
    if (osaka) map[osaka] = '大阪'; // 両方にある場合は管理シートと同じく大阪を優先
  });
  return map;
}

/**
 * 管理シートから、所属ID（REALITY大阪紐付け済／REALITY MUSIC紐付け済 のB列）と、
 * 過去の月のボーナス売上（REALITY売上計算（…）◯月実績 のJ列）を取り込む。何度実行しても同じ結果になる。
 */
function importFromManagementSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const res = importManagement_(ss, true);
  renderSalesDashboard_(ss, null);
  ss.toast('所属ID：大阪 ' + res.osaka + '人・MUSIC ' + res.music + '人／ボーナス：' + res.filled + '件を取り込みました',
    '売上ダッシュボード', 8);
}

/**
 * 管理シートの読み込み本体。withIds=false のときはボーナスだけ（CSV取込のたびに自動で呼ぶ）。
 * ボーナスは管理シート（REALITY売上抜粋シートの「今月のスコアボーナス金額」）の値を正とする。
 */
function importManagement_(ss, withIds) {
  const src = SpreadsheetApp.openById(MANAGEMENT_SHEET_ID);
  // シート名は「（東京/大阪/MUSIC）」のように / や空白が入ることがあるので、それらを除いて比べる
  const plain = function (n) { return String(n).replace(/[\s/／・]/g, ''); };
  const findSheet = function (name) {
    return src.getSheets().filter(function (x) { return plain(x.getName()) === plain(name); })[0] || null;
  };
  const idsOf = function (name) {
    const s = findSheet(name);
    if (!s || s.getLastRow() < 2) return [];
    return s.getRange(2, 2, s.getLastRow() - 1, 1).getValues()
      .map(function (r) { return String(r[0]).trim(); })
      .filter(function (v, i, a) { return v && v !== 'ID' && a.indexOf(v) === i; });
  };
  const osaka = withIds ? idsOf('REALITY大阪紐付け済') : [];
  const music = withIds ? idsOf('REALITY MUSIC紐付け済') : [];
  readAffiliations_(ss); // シートがなければ作る
  const sheet = ss.getSheetByName(SHEET.affiliation);
  if (withIds && sheet.getLastRow() >= 2) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  const n = Math.max(osaka.length, music.length);
  if (n) {
    ensureRows_(sheet, n + 1);
    const out = [];
    for (let i = 0; i < n; i++) out.push([osaka[i] || '', music[i] || '']);
    sheet.getRange(2, 1, n, 2).setNumberFormat('@').setValues(out);
  }

  // 過去の月のボーナス
  const now = new Date();
  const bonusByMonth = {};
  src.getSheets().forEach(function (s) {
    const name = plain(s.getName());
    const m = name.match(/^REALITY売上計算（[^）]*）(\d{1,2})月(実績|結果)$/);
    // 「◯月実績」は過去の月、「REALITY売上計算（東京大阪MUSIC）」は今月（途中）
    let key;
    if (m) {
      const month = Number(m[1]);
      key = (month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear()) * 100 + month;
    } else if (name === plain('REALITY売上計算（東京大阪MUSIC）')) {
      key = ym_(now);
    } else {
      return;
    }
    if (s.getLastRow() < 14) return;
    const map = bonusByMonth[key] || (bonusByMonth[key] = {});
    // 一覧の始まりの行がシートによって違うので、14行目から下で C列がIDの行を拾う
    s.getRange(14, 3, s.getLastRow() - 13, 8).getValues().forEach(function (r) {
      const id = String(r[0]).trim();
      // C列＝ID、J列＝ボーナス売上。下のほうに古い行が重複して残っていることがあるので、最初の行を使う
      if (/^[0-9a-z]{20,}$/.test(id) && !(id in map)) map[id] = num_(r[7]);
    });
  });
  const monthly = ss.getSheetByName(SHEET.monthly);
  ensureCols_(monthly, 14);
  monthly.getRange(1, 14).setValue('ボーナス金額');
  let filled = 0;
  if (monthly.getLastRow() >= 2) {
    const keys = monthly.getRange(2, 1, monthly.getLastRow() - 1, 2).getValues();
    const bonus = monthly.getRange(2, 14, keys.length, 1).getValues();
    keys.forEach(function (k, i) {
      const map = bonusByMonth[Number(k[0])];
      if (map && String(k[1]).trim() in map) {
        bonus[i][0] = map[String(k[1]).trim()];
        filled++;
      }
    });
    monthly.getRange(2, 14, bonus.length, 1).setValues(bonus);
  }
  return { osaka: osaka.length, music: music.length, filled: filled };
}

/** 月次RAW（N列のボーナスまで）から、月×所属の集計とタレント別の一覧を作る */
function salesData_(ss) {
  const sheet = ss.getSheetByName(SHEET.monthly);
  const last = sheet.getLastRow();
  ensureCols_(sheet, 14);
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 14).getValues();
  const affil = readAffiliations_(ss);
  const rate = readConfig_(ss).rate;
  const months = {};
  rows.forEach(function (r) {
    const m = Number(r[0]);
    const id = String(r[1]).trim();
    if (!m || !id) return;
    const d = months[m] || (months[m] = { groups: {}, talents: [] });
    const group = affil[id] || '東京';
    const t = {
      id: id, name: String(r[2]), group: group, count: num_(r[4]), hours: num_(r[5]), viewers: num_(r[6]),
      gift: num_(r[7]), score: num_(r[8]), bonus: num_(r[13]),
    };
    t.stream = t.gift * rate;
    t.total = t.stream + t.bonus;
    d.talents.push(t);
    [group, '合計'].forEach(function (g) {
      const s = d.groups[g] || (d.groups[g] = { n: 0, count: 0, hours: 0, viewers: 0, gift: 0, score: 0, bonus: 0, stream: 0, total: 0 });
      s.n++;
      ['count', 'hours', 'viewers', 'gift', 'score', 'bonus', 'stream', 'total'].forEach(function (k) { s[k] += t[k]; });
    });
  });
  return { months: months, list: Object.keys(months).map(Number).sort(function (a, b) { return a - b; }), rate: rate };
}

const SALES_GROUP_COLOR = { 東京: '#4472C4', 大阪: '#ED7D31', MUSIC: '#70AD47' };

/** 売上ダッシュボードシートを作り直す（month：表示する月。null なら最新月） */
function renderSalesDashboard_(ss, month) {
  const data = salesData_(ss);
  if (!data.list.length) return;
  if (!month || !data.months[month]) month = data.list[data.list.length - 1];
  const prevMonth = addMonths_(month, -1);
  const cur = data.months[month];
  const prev = data.months[prevMonth] || null;
  const zero = { n: 0, count: 0, hours: 0, viewers: 0, gift: 0, score: 0, bonus: 0, stream: 0, total: 0 };
  const g = function (d, name) { return (d && d.groups[name]) || zero; };
  const nowYm = ym_(new Date());

  const sheet = getOrCreateSheet_(ss, SHEET.sales);
  sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
  // 結合の解除はシート全体でまとめて行う（結合の一部だけを選ぶとエラーになるため）。B3 の月はこのあと入れ直す
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  ensureRows_(sheet, 80);
  ensureCols_(sheet, 26);
  sheet.setHiddenGridlines(true);
  [16, 110, 90, 90, 90, 90, 110, 100, 100, 110, 110, 100, 80, 24].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  // タイトルと月の選択（B3）
  sheet.getRange('B1:M1').merge().setValue('REALITY 売上ダッシュボード（所属別）')
    .setFontSize(16).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(HEADER_BG);
  sheet.setRowHeight(1, 40);
  sheet.getRange('B2:M2').merge().setValue(
    '配信売上＝合計ギフト金額×' + Math.round(data.rate * 100) + '%、TOTAL売上＝配信売上＋ボーナス。所属は「' + SHEET.affiliation +
      '」シート（大阪・MUSICのID）で決まり、それ以外は東京。CSVを取り込むたびに自動で更新されます。'
  ).setFontSize(9).setFontColor('#666666').setWrap(true);
  sheet.getRange('A3').setValue('');
  sheet.getRange('B3').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(data.list.slice().reverse().map(monthLabel_), true).build()
  ).setNumberFormat('@').setValue(monthLabel_(month)).setBackground('#FFF2CC').setFontWeight('bold').setFontColor('#1155CC');
  sheet.getRange('C3').setValue('← 月を選ぶと切り替わります' + (month >= nowYm ? '（今月は途中経過）' : ''))
    .setFontColor(month >= nowYm ? '#CC0000' : '#666666').setFontSize(9);

  // 数字のパネル
  const total = g(cur, '合計');
  const ptotal = g(prev, '合計');
  const tiles = [
    ['TOTAL売上', total.total, ptotal.total, '¥#,##0'],
    ['合計ギフト金額', total.gift, ptotal.gift, '¥#,##0'],
    ['ボーナス売上', total.bonus, ptotal.bonus, '¥#,##0'],
    ['配信人数', total.n, ptotal.n, '#,##0"人"'],
    ['1人あたり売上', total.n ? total.total / total.n : 0, ptotal.n ? ptotal.total / ptotal.n : 0, '¥#,##0'],
    ['配信時間', total.hours, ptotal.hours, '#,##0"h"'],
  ];
  tiles.forEach(function (t, i) {
    const col = 2 + i * 2;
    sheet.getRange(5, col, 1, 2).merge().setValue(t[0]).setFontSize(9).setFontColor('#666666');
    sheet.getRange(6, col, 1, 2).merge().setValue(t[1]).setNumberFormat(t[3]).setFontSize(18).setFontWeight('bold');
    const delta = prev && t[2] ? t[1] / t[2] - 1 : null;
    sheet.getRange(7, col, 1, 2).merge().setValue(delta === null ? '前月 —' : '前月比 ' + (delta >= 0 ? '+' : '') + Math.round(delta * 1000) / 10 + '%')
      .setFontSize(9).setFontColor(delta === null ? '#999999' : delta >= 0 ? '#1E7B4A' : '#C0392B');
    sheet.getRange(5, col, 3, 2).setBackground('#F3F6FB').setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, '#C9D3E6', SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setRowHeight(6, 36);

  // 所属別の表
  let r = 10;
  sheet.getRange(r - 1, 2).setValue('所属別　' + monthLabel_(month)).setFontWeight('bold');
  const head = ['所属', '配信人数', '配信回数', '配信時間', '視聴者数', '合計ギフト金額', '獲得スコア', 'ボーナス売上', '配信売上', 'TOTAL売上', '1人あたり', '構成比'];
  styleHeader_(sheet.getRange(r, 2, 1, head.length).setValues([head]));
  const groupRows = AFFILIATIONS.concat(['合計']).map(function (name) {
    const s = g(cur, name);
    return [name, s.n, s.count, s.hours, s.viewers, s.gift, s.score, s.bonus, s.stream, s.total, s.n ? s.total / s.n : 0, total.total ? s.total / total.total : 0];
  });
  sheet.getRange(r + 1, 2, groupRows.length, head.length).setValues(groupRows);
  sheet.getRange(r + 1, 3, 4, 2).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 5, 4, 1).setNumberFormat('#,##0.0');
  sheet.getRange(r + 1, 6, 4, 1).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 7, 4, 1).setNumberFormat('¥#,##0');
  sheet.getRange(r + 1, 8, 4, 1).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 9, 4, 4).setNumberFormat('¥#,##0');
  sheet.getRange(r + 1, 13, 4, 1).setNumberFormat('0.0%');
  sheet.getRange(r + 4, 2, 1, head.length).setFontWeight('bold').setBackground('#F3F6FB');
  AFFILIATIONS.forEach(function (name, i) { sheet.getRange(r + 1 + i, 2).setFontColor(SALES_GROUP_COLOR[name]).setFontWeight('bold'); });
  sheet.getRange(r, 2, 5, head.length).setBorder(true, true, true, true, true, true, '#D9D9D9', SpreadsheetApp.BorderStyle.SOLID);

  // ティア別×所属（その月を評価月にした判定）
  const cfg = readConfig_(ss);
  const idx = buildMonthlyIndex_(readMonthlyRows_(ss));
  const tierOf = {};
  judgeMonth_(idx, month, cfg).forEach(function (j) { tierOf[j.id] = j.tier; });
  r = 17;
  sheet.getRange(r - 1, 2).setValue('ティア別（' + monthLabel_(month) + 'を評価月にした判定）').setFontWeight('bold');
  const tHead = ['ティア', '東京', '大阪', 'MUSIC', '合計人数', 'TOTAL売上', '1人あたり'];
  styleHeader_(sheet.getRange(r, 2, 1, tHead.length).setValues([tHead]));
  const tierRows = TIERS.map(function (tier) {
    const people = cur.talents.filter(function (t) { return tierOf[t.id] === tier; });
    const sum = people.reduce(function (a, t) { return a + t.total; }, 0);
    const cnt = function (grp) { return people.filter(function (t) { return t.group === grp; }).length; };
    return [tier, cnt('東京'), cnt('大阪'), cnt('MUSIC'), people.length, sum, people.length ? sum / people.length : 0];
  });
  sheet.getRange(r + 1, 2, tierRows.length, tHead.length).setValues(tierRows);
  sheet.getRange(r + 1, 3, tierRows.length, 4).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 7, tierRows.length, 2).setNumberFormat('¥#,##0');
  TIERS.forEach(function (tier, i) { sheet.getRange(r + 1 + i, 2).setBackground(TIER_COLOR[tier]).setFontWeight('bold'); });
  sheet.getRange(r, 2, tierRows.length + 1, tHead.length).setBorder(true, true, true, true, true, true, '#D9D9D9', SpreadsheetApp.BorderStyle.SOLID);

  // 月別の推移
  r = 26;
  sheet.getRange(r - 1, 2).setValue('月別の推移（TOTAL売上）').setFontWeight('bold');
  const mHead = ['月', '東京', '大阪', 'MUSIC', '合計', '配信人数', '1人あたり', '前月比'];
  styleHeader_(sheet.getRange(r, 2, 1, mHead.length).setValues([mHead]));
  const mRows = data.list.map(function (m, i) {
    const d = data.months[m];
    const t = g(d, '合計');
    const p = i > 0 ? g(data.months[data.list[i - 1]], '合計').total : 0;
    return [monthLabel_(m) + (m >= nowYm ? '（途中）' : ''), g(d, '東京').total, g(d, '大阪').total, g(d, 'MUSIC').total, t.total, t.n,
      t.n ? t.total / t.n : 0, p ? t.total / p - 1 : ''];
  });
  sheet.getRange(r + 1, 2, mRows.length, 1).setNumberFormat('@');
  sheet.getRange(r + 1, 2, mRows.length, mHead.length).setValues(mRows);
  sheet.getRange(r + 1, 3, mRows.length, 4).setNumberFormat('¥#,##0');
  sheet.getRange(r + 1, 7, mRows.length, 1).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 8, mRows.length, 1).setNumberFormat('¥#,##0');
  sheet.getRange(r + 1, 9, mRows.length, 1).setNumberFormat('+0.0%;-0.0%;0.0%');
  sheet.getRange(r, 2, mRows.length + 1, mHead.length).setBorder(true, true, true, true, true, true, '#D9D9D9', SpreadsheetApp.BorderStyle.SOLID);
  const selRow = data.list.indexOf(month);
  if (selRow >= 0) sheet.getRange(r + 1 + selRow, 2, 1, mHead.length).setBackground('#FFF2CC');
  const deltaRange = sheet.getRange(r + 1, 9, mRows.length, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#1E7B4A').setRanges([deltaRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#C0392B').setRanges([deltaRange]).build(),
  ]);

  // TOTAL売上 上位10人
  const top = cur.talents.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 10);
  const tTop = r + mRows.length + 3;
  sheet.getRange(tTop - 1, 2).setValue('TOTAL売上 上位10人　' + monthLabel_(month)).setFontWeight('bold');
  const topHead = ['配信者名', '所属', 'ティア', '合計ギフト金額', 'ボーナス', 'TOTAL売上', '配信時間'];
  styleHeader_(sheet.getRange(tTop, 2, 1, topHead.length).setValues([topHead]));
  if (top.length) {
    sheet.getRange(tTop + 1, 2, top.length, 1).setNumberFormat('@');
    sheet.getRange(tTop + 1, 2, top.length, topHead.length).setValues(top.map(function (t) {
      return [t.name, t.group, tierOf[t.id] || '', t.gift, t.bonus, t.total, t.hours];
    }));
    sheet.getRange(tTop + 1, 5, top.length, 3).setNumberFormat('¥#,##0');
    sheet.getRange(tTop + 1, 8, top.length, 1).setNumberFormat('#,##0.0"h"');
    sheet.getRange(tTop, 2, top.length + 1, topHead.length).setBorder(true, true, true, true, true, true, '#D9D9D9', SpreadsheetApp.BorderStyle.SOLID);
  }
  sheet.setFrozenRows(3);
  SpreadsheetApp.flush();

  // グラフ（O列から右）
  const chartCol = 15;
  sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(r, 2, mRows.length + 1, 4)).setNumHeaders(1)
    .setPosition(4, chartCol, 0, 0)
    .setOption('title', '月別 TOTAL売上（所属別）').setOption('isStacked', true).setOption('legend', { position: 'top' })
    .setOption('colors', [SALES_GROUP_COLOR['東京'], SALES_GROUP_COLOR['大阪'], SALES_GROUP_COLOR['MUSIC']])
    .setOption('vAxis', { format: '¥#,##0' }).setOption('width', 640).setOption('height', 300).build());
  sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange(10, 2, 4, 1)).addRange(sheet.getRange(10, 11, 4, 1)).setNumHeaders(1)
    .setPosition(20, chartCol, 0, 0)
    .setOption('title', monthLabel_(month) + ' TOTAL売上の所属構成').setOption('pieHole', 0.5)
    .setOption('colors', [SALES_GROUP_COLOR['東京'], SALES_GROUP_COLOR['大阪'], SALES_GROUP_COLOR['MUSIC']])
    .setOption('width', 320).setOption('height', 260).build());
  sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(17, 2, 7, 1)).addRange(sheet.getRange(17, 7, 7, 1)).setNumHeaders(1)
    .setPosition(20, chartCol + 3, 40, 0)
    .setOption('title', 'ティア別 TOTAL売上').setOption('legend', { position: 'none' }).setOption('colors', [HEADER_BG])
    .setOption('vAxis', { format: '¥#,##0' }).setOption('width', 320).setOption('height', 260).build());
  if (top.length) {
    sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange(tTop, 2, top.length + 1, 1)).addRange(sheet.getRange(tTop, 7, top.length + 1, 1)).setNumHeaders(1)
      .setPosition(34, chartCol, 0, 0)
      .setOption('title', 'TOTAL売上 上位10人').setOption('legend', { position: 'none' }).setOption('colors', [SALES_GROUP_COLOR['東京']])
      .setOption('hAxis', { format: '¥#,##0' }).setOption('width', 640).setOption('height', 320).build());
  }
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
      bonus: num_(cell_(r, col.bonus)),
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
    const aliases = COLUMN_ALIASES[k].map(normHeader_);
    // 完全一致 → 「列名（単位）」のように後ろに括弧が付いた列 の順で探す
    aliases.some(function (a) { out[k] = norm.indexOf(a); return out[k] >= 0; });
    if (out[k] < 0) {
      aliases.some(function (a) {
        out[k] = norm.findIndex(function (h) { return h.indexOf(a + '(') === 0; });
        return out[k] >= 0;
      });
    }
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

// ===== アプリの画面（自動生成：reality-tier/webapp/App.html を node reality-tier/build.js で埋め込む） =====
// <APP_HTML>
const APP_HTML_ = [
  "<title>ライバーTier判定 REALITY</title>",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Zen+Kaku+Gothic+New:wght@700;900&family=Roboto+Mono:wght@500&display=swap\">",
  "<style>",
  "/* Layout: 月タブ → ティア人数の帯 → 絞り込み → T1〜未評価の6列ボード（狭い画面では縦積み）。人を押すと右から詳細パネル */",
  ":root {",
  "  --bg: #f3f5f9;",
  "  --surface: #ffffff;",
  "  --surface-2: #eef1f7;",
  "  --fg: #172033;",
  "  --muted: #5d6880;",
  "  --line: #dde2ec;",
  "  --accent: #3b4fd8;",
  "  --accent-fg: #ffffff;",
  "  --accent-soft: #e6e9fc;",
  "  --up: #12805c;",
  "  --down: #c23a3a;",
  "  --warn-bg: #fff4dc;",
  "  --warn-fg: #7a5200;",
  "  --t1: #f2c94c; --t1-bg: #fdf4d6; --t1-fg: #6b4e00;",
  "  --t2: #3fae7a; --t2-bg: #e1f4ea; --t2-fg: #135c3a;",
  "  --t3: #4a8fe0; --t3-bg: #e2eefc; --t3-fg: #1b4f8f;",
  "  --t4: #9b6fd6; --t4-bg: #efe6fa; --t4-fg: #5a3593;",
  "  --t5: #9aa3b5; --t5-bg: #eef0f4; --t5-fg: #4a5367;",
  "  --tu: #c4cad6; --tu-bg: #f7f8fa; --tu-fg: #5d6880;",
  "  --shadow: 0 1px 2px rgba(23, 32, 51, .06), 0 4px 16px rgba(23, 32, 51, .06);",
  "  --f-display: \"Zen Kaku Gothic New\", \"Hiragino Sans\", \"Yu Gothic\", sans-serif;",
  "  --f-body: \"BIZ UDPGothic\", \"Hiragino Sans\", \"Yu Gothic\", \"Meiryo\", sans-serif;",
  "  --f-num: \"Roboto Mono\", ui-monospace, \"SFMono-Regular\", Menlo, monospace;",
  "}",
  "@media (prefers-color-scheme: dark) {",
  "  :root:not([data-theme=\"light\"]) {",
  "    --bg: #11151f; --surface: #1a2030; --surface-2: #222a3d; --fg: #e7ebf3; --muted: #9aa5bd; --line: #2e3850;",
  "    --accent: #8f9cff; --accent-fg: #11151f; --accent-soft: #262e57; --up: #52c999; --down: #ff8080;",
  "    --warn-bg: #3a2f14; --warn-fg: #f3d58a;",
  "    --t1-bg: #3a3112; --t1-fg: #f6dc85; --t2-bg: #163527; --t2-fg: #8fdcb5; --t3-bg: #172c48; --t3-fg: #9cc6f6;",
  "    --t4-bg: #2c2042; --t4-fg: #ccb2f2; --t5-bg: #252b38; --t5-fg: #b6bdcc; --tu-bg: #1d2331; --tu-fg: #9aa5bd;",
  "    --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 4px 16px rgba(0, 0, 0, .25);",
  "    color-scheme: dark;",
  "  }",
  "}",
  ":root[data-theme=\"dark\"] {",
  "  --bg: #11151f; --surface: #1a2030; --surface-2: #222a3d; --fg: #e7ebf3; --muted: #9aa5bd; --line: #2e3850;",
  "  --accent: #8f9cff; --accent-fg: #11151f; --accent-soft: #262e57; --up: #52c999; --down: #ff8080;",
  "  --warn-bg: #3a2f14; --warn-fg: #f3d58a;",
  "  --t1-bg: #3a3112; --t1-fg: #f6dc85; --t2-bg: #163527; --t2-fg: #8fdcb5; --t3-bg: #172c48; --t3-fg: #9cc6f6;",
  "  --t4-bg: #2c2042; --t4-fg: #ccb2f2; --t5-bg: #252b38; --t5-fg: #b6bdcc; --tu-bg: #1d2331; --tu-fg: #9aa5bd;",
  "  --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 4px 16px rgba(0, 0, 0, .25);",
  "  color-scheme: dark;",
  "}",
  "* { box-sizing: border-box; }",
  "[hidden] { display: none !important; }",
  "html, body { margin: 0; }",
  "img { max-width: 100%; }",
  "body { background: var(--bg); color: var(--fg); font-family: var(--f-body); font-size: 14px; line-height: 1.55; }",
  ".wrap { max-width: 1480px; margin: 0 auto; padding-block: 24px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 16px; }",
  "h1, h2, h3 { font-family: var(--f-display); margin: 0; text-wrap: balance; }",
  ".num { font-family: var(--f-num); font-variant-numeric: tabular-nums; }",
  "button, input, select, textarea { font: inherit; color: inherit; }",
  "button { cursor: pointer; }",
  ":focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",
  "",
  "/* header */",
  ".top { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }",
  ".title { display: grid; gap: 4px; min-width: 0; }",
  ".title h1 { font-size: 26px; font-weight: 900; letter-spacing: .01em; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }",
  ".title h1 small { font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: .12em; }",
  ".title p { margin: 0; color: var(--muted); font-size: 13px; }",
  ".actions { display: flex; flex-wrap: wrap; gap: 8px; }",
  ".btn { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 9px 16px; font-weight: 700; font-size: 13px; }",
  ".btn:hover { border-color: var(--accent); }",
  ".btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }",
  ".btn.primary:hover { filter: brightness(1.08); }",
  ".btn[disabled] { opacity: .45; cursor: not-allowed; }",
  ".notice { background: var(--warn-bg); color: var(--warn-fg); border-radius: 8px; padding: 10px 14px; font-size: 13px; }",
  "",
  "/* month tabs */",
  ".tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }",
  ".tab { flex: none; border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 6px 14px; font-size: 13px; white-space: nowrap; }",
  ".tab .partial { font-size: 11px; color: var(--warn-fg); background: var(--warn-bg); border-radius: 4px; padding: 0 4px; margin-left: 4px; }",
  ".tab[aria-selected=\"true\"] { background: var(--fg); color: var(--bg); border-color: var(--fg); font-weight: 700; }",
  ".tab[aria-selected=\"true\"] .partial { background: transparent; color: inherit; }",
  "",
  "/* tier strip */",
  ".strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); }",
  ".cell { padding: 12px 14px; display: grid; gap: 2px; border-right: 1px solid var(--line); }",
  ".cell:last-child { border-right: 0; }",
  ".cell .lbl { font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 6px; }",
  ".cell .val { font-family: var(--f-num); font-size: 26px; line-height: 1.15; font-variant-numeric: tabular-nums; }",
  ".cell .val small { font-family: var(--f-body); font-size: 12px; color: var(--muted); margin-left: 2px; }",
  ".cell .delta { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }",
  ".delta .up { color: var(--up); font-weight: 700; } .delta .down { color: var(--down); font-weight: 700; }",
  ".dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }",
  ".moves { font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 16px; }",
  ".moves b { color: var(--fg); font-variant-numeric: tabular-nums; }",
  "",
  "/* filters */",
  ".filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }",
  ".filters input, .filters select { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 8px 10px; font-size: 13px; }",
  ".filters input { width: min(260px, 100%); }",
  ".filters .spacer { flex: 1; }",
  ".filters .meta { font-size: 12px; color: var(--muted); }",
  "",
  "/* board */",
  ".board { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; align-items: start; }",
  ".col { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; display: grid; grid-template-rows: auto auto 1fr; min-width: 0; overflow: hidden; }",
  ".col-head { padding: 10px 12px 6px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-top: 4px solid var(--c); }",
  ".col-head h2 { font-size: 18px; font-weight: 900; }",
  ".col-head .count { font-family: var(--f-num); font-size: 13px; color: var(--muted); }",
  ".col-desc { padding: 0 12px 8px; font-size: 11px; color: var(--muted); border-bottom: 1px solid var(--line); line-height: 1.45; }",
  ".list { list-style: none; margin: 0; padding: 4px; max-height: 64vh; overflow-y: auto; display: grid; gap: 2px; align-content: start; }",
  ".person { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 2px 6px; align-items: center; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 6px; padding: 6px; }",
  ".person:hover { background: var(--surface-2); }",
  ".person .no { font-family: var(--f-num); font-size: 11px; color: var(--muted); text-align: right; }",
  ".person .nm { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".person .sales { grid-column: 2; font-family: var(--f-num); font-size: 11px; color: var(--muted); }",
  ".person .chip { grid-row: 1 / span 2; grid-column: 3; }",
  ".chip { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 5px; white-space: nowrap; background: var(--surface-2); color: var(--muted); }",
  ".chip.up { background: color-mix(in srgb, var(--up) 14%, transparent); color: var(--up); }",
  ".chip.down { background: color-mix(in srgb, var(--down) 14%, transparent); color: var(--down); }",
  ".chip.new { background: var(--accent-soft); color: var(--accent); }",
  ".empty-col { padding: 16px 12px; color: var(--muted); font-size: 12px; }",
  "",
  ".tier-T1 { --c: var(--t1); --cb: var(--t1-bg); --cf: var(--t1-fg); }",
  ".tier-T2 { --c: var(--t2); --cb: var(--t2-bg); --cf: var(--t2-fg); }",
  ".tier-T3 { --c: var(--t3); --cb: var(--t3-bg); --cf: var(--t3-fg); }",
  ".tier-T4 { --c: var(--t4); --cb: var(--t4-bg); --cf: var(--t4-fg); }",
  ".tier-T5 { --c: var(--t5); --cb: var(--t5-bg); --cf: var(--t5-fg); }",
  ".tier-U  { --c: var(--tu); --cb: var(--tu-bg); --cf: var(--tu-fg); }",
  ".badge { display: inline-block; border-radius: 5px; padding: 1px 7px; font-weight: 700; font-size: 12px; background: var(--cb); color: var(--cf); }",
  "",
  "/* empty state */",
  ".empty { background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; padding: 48px 24px; text-align: center; display: grid; gap: 8px; justify-items: center; }",
  ".empty h2 { font-size: 18px; }",
  ".empty p { margin: 0; color: var(--muted); max-width: 46ch; }",
  "",
  "/* drawer */",
  ".scrim { position: fixed; inset: 0; background: rgba(10, 14, 24, .35); z-index: 20; }",
  ".drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100%); background: var(--surface); z-index: 21; box-shadow: -8px 0 32px rgba(0, 0, 0, .2); display: grid; grid-template-rows: auto 1fr; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); padding-right: env(safe-area-inset-right, 0px); }",
  ".drawer-head { padding: 16px 20px 12px; border-bottom: 1px solid var(--line); display: grid; gap: 6px; }",
  ".drawer-head .row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }",
  ".drawer-head h2 { font-size: 18px; word-break: break-all; }",
  ".drawer-head .sub { font-size: 12px; color: var(--muted); word-break: break-all; }",
  ".x { border: 0; background: var(--surface-2); border-radius: 8px; width: 32px; height: 32px; font-size: 18px; line-height: 1; flex: none; }",
  ".drawer-body { overflow-y: auto; padding: 16px 20px 32px; display: flex; flex-direction: column; gap: 18px; min-height: 0; }",
  ".drawer-body > * { flex-shrink: 0; }",
  ".kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }",
  ".kv div { background: var(--surface); padding: 8px 10px; display: grid; gap: 2px; }",
  ".kv dt { font-size: 11px; color: var(--muted); }",
  ".kv dd { margin: 0; font-family: var(--f-num); font-variant-numeric: tabular-nums; font-size: 14px; }",
  ".kv dd.ok { color: var(--up); } .kv dd.ng { color: var(--down); }",
  ".reason { background: var(--cb); color: var(--cf); border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px; font-size: 13px; }",
  ".reason b { font-size: 12px; opacity: .8; }",
  ".section-title { font-size: 13px; font-weight: 700; color: var(--muted); letter-spacing: .04em; }",
  ".hist { width: 100%; border-collapse: collapse; font-size: 12px; }",
  ".hist th, .hist td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }",
  ".hist th:first-child, .hist td:first-child { text-align: left; }",
  ".hist th { color: var(--muted); font-weight: 700; font-size: 11px; }",
  ".hist td { font-family: var(--f-num); font-variant-numeric: tabular-nums; }",
  ".hist tr.sel td { background: var(--accent-soft); }",
  ".table-scroll { overflow-x: auto; }",
  ".form { display: grid; gap: 8px; }",
  ".form label { font-size: 12px; color: var(--muted); display: grid; gap: 4px; }",
  ".form input, .form textarea { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 8px 10px; font-size: 13px; width: 100%; }",
  ".form textarea { min-height: 72px; resize: vertical; }",
  ".saved { font-size: 12px; color: var(--up); }",
  "",
  "/* dialog */",
  ".modal { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; background: rgba(10, 14, 24, .4); }",
  ".dialog { background: var(--surface); border-radius: 14px; width: min(620px, 100%); max-height: calc(100% - 32px); overflow-y: auto; box-shadow: 0 12px 48px rgba(0, 0, 0, .3); padding: 20px; display: grid; gap: 14px; }",
  ".dialog h2 { font-size: 18px; }",
  ".dialog p { margin: 0; color: var(--muted); font-size: 13px; }",
  ".drop { border: 2px dashed var(--line); border-radius: 12px; padding: 28px 16px; text-align: center; color: var(--muted); display: grid; gap: 8px; justify-items: center; }",
  ".drop.over { border-color: var(--accent); background: var(--accent-soft); }",
  ".files { display: grid; gap: 8px; }",
  ".file { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px; font-size: 13px; }",
  ".file .name { font-weight: 700; word-break: break-all; }",
  ".file .info { color: var(--muted); font-size: 12px; }",
  ".file .err { color: var(--down); font-size: 12px; }",
  ".file .warn { color: var(--warn-fg); background: var(--warn-bg); border-radius: 6px; padding: 4px 8px; font-size: 12px; }",
  ".file .ok { color: var(--up); font-size: 12px; font-weight: 700; }",
  ".file input[type=\"month\"] { border: 1px solid var(--line); background: var(--surface); border-radius: 6px; padding: 4px 8px; }",
  ".dialog-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }",
  ".grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }",
  ".check { display: flex !important; align-items: center; gap: 8px; grid-auto-flow: column; }",
  ".check input { width: auto; }",
  ".footer { color: var(--muted); font-size: 12px; display: grid; gap: 4px; }",
  ".footer p { margin: 0; }",
  "",
  "@media (max-width: 1100px) {",
  "  .board { grid-template-columns: repeat(3, minmax(0, 1fr)); }",
  "  .strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }",
  "  .cell { border-bottom: 1px solid var(--line); }",
  "}",
  "@media (max-width: 640px) {",
  "  .board { grid-template-columns: minmax(0, 1fr); }",
  "  .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
  "  .list { max-height: 420px; }",
  "  .title h1 { font-size: 22px; }",
  "  .grid2 { grid-template-columns: minmax(0, 1fr); }",
  "}",
  "@media (prefers-reduced-motion: no-preference) {",
  "  .drawer { animation: slide .18s ease-out; }",
  "  @keyframes slide { from { transform: translateX(24px); opacity: .6; } }",
  "}",
  "</style>",
  "",
  "<div class=\"wrap\">",
  "  <header class=\"top\">",
  "    <div class=\"title\">",
  "      <h1>ライバーTier判定 <small>REALITY</small></h1>",
  "      <p>REALITYの配信レポートCSV（月初からの累計）を取り込むと、各月を評価月としてT1〜T5を自動判定します。最新の確定月が自動で表示されます。</p>",
  "    </div>",
  "    <div class=\"actions\">",
  "      <button class=\"btn\" id=\"btn-criteria\" type=\"button\">判定基準</button>",
  "      <button class=\"btn\" id=\"btn-export\" type=\"button\" disabled>この月をCSV書き出し</button>",
  "      <button class=\"btn primary\" id=\"btn-import\" type=\"button\">CSVを取り込む</button>",
  "    </div>",
  "  </header>",
  "",
  "  <div class=\"notice\" id=\"notice\" hidden></div>",
  "",
  "  <nav class=\"tabs\" id=\"tabs\" aria-label=\"評価月\"></nav>",
  "",
  "  <main id=\"main\">",
  "    <section class=\"empty\" id=\"empty\">",
  "      <h2 id=\"empty-title\">データを読み込んでいます…</h2>",
  "      <p id=\"empty-text\">取り込んだ月がタブとして並び、選んだ月のT1〜T5のメンバーが表示されます。</p>",
  "    </section>",
  "    <div id=\"view\" hidden style=\"display:grid;gap:14px\">",
  "      <section class=\"strip\" id=\"strip\" aria-label=\"ティア別の人数\"></section>",
  "      <div class=\"moves\" id=\"moves\"></div>",
  "      <div class=\"filters\">",
  "        <input id=\"q\" type=\"search\" placeholder=\"配信者名・IDで探す\" aria-label=\"配信者名・IDで探す\">",
  "        <select id=\"f-owner\" aria-label=\"担当者\"><option value=\"\">担当者：すべて</option></select>",
  "        <select id=\"f-change\" aria-label=\"前月からの変化\">",
  "          <option value=\"\">変化：すべて</option>",
  "          <option value=\"昇格\">昇格</option>",
  "          <option value=\"降格\">降格</option>",
  "          <option value=\"維持\">維持</option>",
  "          <option value=\"新規\">新規</option>",
  "        </select>",
  "        <span class=\"spacer\"></span>",
  "        <span class=\"meta\" id=\"meta\"></span>",
  "      </div>",
  "      <section class=\"board\" id=\"board\" aria-label=\"ティア別メンバー\"></section>",
  "    </div>",
  "  </main>",
  "",
  "  <footer class=\"footer\">",
  "    <p id=\"criteria-line\"></p>",
  "    <p><span id=\"last-import\"></span>　<a id=\"sheet-link\" href=\"#\" target=\"_blank\" rel=\"noopener\" hidden>スプレッドシートを開く</a></p>",
  "    <p>売上＝CSVの合計ギフト金額（円）。会社売上はその還元率ぶん。前月＝前月を評価月にしたときのティア。</p>",
  "  </footer>",
  "</div>",
  "",
  "<div class=\"scrim\" id=\"scrim\" hidden></div>",
  "<aside class=\"drawer\" id=\"drawer\" hidden aria-label=\"配信者の詳細\"></aside>",
  "",
  "<div class=\"modal\" id=\"import-modal\" hidden>",
  "  <div class=\"dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"imp-title\">",
  "    <h2 id=\"imp-title\">CSVを取り込む</h2>",
  "    <p>REALITYの配信レポートCSVをドロップするか選んでください（複数可・UTF-8／Shift_JIS）。ファイル名 <span class=\"num\">streamer_20261001_20261014.csv</span> の開始日から対象月を決めます。同じ月を取り込み直すと、その月の数値を最新の累計で置き換えます。スプレッドシートに直接取り込み、すべての月のティアを判定し直します（30秒ほどかかります）。</p>",
  "    <label class=\"drop\" id=\"drop\">",
  "      <span>ここにCSVをドロップ</span>",
  "      <span class=\"btn\">ファイルを選ぶ</span>",
  "      <input id=\"file\" type=\"file\" accept=\".csv,.tsv,.txt,text/csv\" multiple hidden>",
  "    </label>",
  "    <div class=\"files\" id=\"files\"></div>",
  "    <div class=\"dialog-actions\">",
  "      <button class=\"btn\" id=\"imp-close\" type=\"button\">閉じる</button>",
  "      <button class=\"btn primary\" id=\"imp-go\" type=\"button\" disabled>取り込む</button>",
  "    </div>",
  "  </div>",
  "</div>",
  "",
  "<div class=\"modal\" id=\"criteria-modal\" hidden>",
  "  <div class=\"dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cr-title\">",
  "    <h2 id=\"cr-title\">判定基準</h2>",
  "    <p>T1→T2→T3→T4→T5の順に判定し、最初に当てはまったティアになります。変更すると全員の画面とすべての月に反映されます。</p>",
  "    <form class=\"form\" id=\"criteria-form\">",
  "      <div class=\"grid2\">",
  "        <label>基本条件：月の配信時間（h）<input id=\"c-hours\" type=\"number\" min=\"0\" step=\"1\" required></label>",
  "        <label>基本条件：月のイベント参加数<input id=\"c-events\" type=\"number\" min=\"0\" step=\"1\" required></label>",
  "        <label>T1：3ヶ月平均の月売上（円）<input id=\"c-t1\" type=\"number\" min=\"0\" step=\"10000\" required></label>",
  "        <label>T2：3ヶ月平均の月売上（円）<input id=\"c-t2\" type=\"number\" min=\"0\" step=\"10000\" required></label>",
  "        <label>T3：月売上（円）<input id=\"c-t3\" type=\"number\" min=\"0\" step=\"10000\" required></label>",
  "        <label>会社への還元率（%）<input id=\"c-rate\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" required></label>",
  "      </div>",
  "      <label class=\"check\"><input id=\"c-rescue\" type=\"checkbox\"> 既存タレントの救済（デビュー4ヶ月目以降でも直近3ヶ月にT3の月売上があればT3）</label>",
  "      <div class=\"dialog-actions\">",
  "        <span class=\"saved\" id=\"cr-msg\"></span>",
  "        <button class=\"btn\" id=\"cr-close\" type=\"button\">閉じる</button>",
  "        <button class=\"btn primary\" id=\"cr-save\" type=\"submit\">保存</button>",
  "      </div>",
  "    </form>",
  "  </div>",
  "</div>",
  "",
  "<script>",
  "(function () {",
  "  'use strict';",
  "",
  "  // ===== 定数 =====",
  "  const TIERS = ['T1', 'T2', 'T3', 'T4', 'T5', '未評価'];",
  "  const TIER_CLASS = { T1: 'tier-T1', T2: 'tier-T2', T3: 'tier-T3', T4: 'tier-T4', T5: 'tier-T5', 未評価: 'tier-U' };",
  "  const DEFAULT_CRITERIA = { hours: 60, events: 5, t1: 500000, t2: 300000, t3: 100000, rescue: true, rate: 0.35 };",
  "  const COLUMN_ALIASES = {",
  "    id: ['ID', '配信者ID', 'ユーザーID', 'ユーザーId', 'streamer_id', 'user_id', 'userId'],",
  "    name: ['配信者名', 'ユーザー名', '名前', 'ニックネーム', '表示名', 'name'],",
  "    rank: ['REALITYランク', 'ランク', 'rank'],",
  "    count: ['配信回数', '合計配信回数'],",
  "    hours: ['合計配信時間（時）', '合計配信時間（h）', '配信時間（時）', '配信時間（h）', '合計配信時間', '配信時間'],",
  "    viewers: ['視聴者数', '合計視聴者数', 'ユニーク視聴者数'],",
  "    gift: ['合計ギフト金額', 'ギフト金額（円）', 'ギフト金額', '合計ギフト'],",
  "    score: ['合計獲得スコア', '獲得スコア', 'スコア', '合計スコア'],",
  "    events: ['参加中のイベント', 'イベント参加数', 'イベント数'],",
  "    debut: ['初配信日', 'デビュー日'],",
  "  };",
  "  const REQUIRED = ['id', 'name', 'hours', 'gift'];",
  "  // 月のデータ（months/<yyyymm>）の rows の並び",
  "  const R = { id: 0, name: 1, rank: 2, count: 3, hours: 4, viewers: 5, gift: 6, score: 7, events: 8, debut: 9 };",
  "",
  "  // ===== 状態 =====",
  "  const state = {",
  "    canWrite: null,",
  "    months: {},          // yyyymm -> { rows, periodEnd }",
  "    criteria: Object.assign({}, DEFAULT_CRITERIA),",
  "    talents: {},         // id -> {owner, memo}",
  "    loaded: false,",
  "    sel: null,           // 表示中の月",
  "    idx: null, view: null,",
  "    open: null,          // 詳細を開いている ID",
  "    pending: [],         // 取込待ちのファイル",
  "  };",
  "  try { const t = localStorage.getItem('reality-tier-month'); if (t) state.sel = Number(t); } catch (e) {}",
  "",
  "  // ===== 小物 =====",
  "  const $ = (id) => document.getElementById(id);",
  "  const el = (tag, attrs, children) => {",
  "    const n = document.createElement(tag);",
  "    if (attrs) for (const k in attrs) {",
  "      if (k === 'class') n.className = attrs[k];",
  "      else if (k === 'text') n.textContent = attrs[k];",
  "      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);",
  "      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);",
  "    }",
  "    (children || []).forEach((c) => c != null && n.append(c));",
  "    return n;",
  "  };",
  "  const yen = (n) => Math.round(n || 0).toLocaleString('ja-JP');",
  "  const man = (n) => (n % 10000 === 0 ? n / 10000 + '万' : yen(n) + '円');",
  "  const fmtH = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);",
  "  const num = (v) => {",
  "    if (typeof v === 'number') return isFinite(v) ? v : 0;",
  "    const n = parseFloat(String(v == null ? '' : v).replace(/[¥￥,，円\\s]/g, ''));",
  "    return isFinite(n) ? n : 0;",
  "  };",
  "  const addMonths = (ym, k) => { const t = Math.floor(ym / 100) * 12 + (ym % 100) - 1 + k; return Math.floor(t / 12) * 100 + (t % 12) + 1; };",
  "  const monthDiff = (a, b) => (Math.floor(a / 100) - Math.floor(b / 100)) * 12 + (a % 100) - (b % 100);",
  "  const monthLabel = (ym) => Math.floor(ym / 100) + '年' + (ym % 100) + '月';",
  "  const nowYm = () => { const d = new Date(); return d.getFullYear() * 100 + d.getMonth() + 1; };",
  "  const parseDate = (v) => {",
  "    const s = String(v == null ? '' : v).trim();",
  "    let m = s.match(/^(\\d{4})[\\/\\-.年](\\d{1,2})[\\/\\-.月](\\d{1,2})/) || s.match(/^(\\d{4})(\\d{2})(\\d{2})$/);",
  "    if (!m) return null;",
  "    return { y: +m[1], m: +m[2], d: +m[3] };",
  "  };",
  "  const ymOf = (v) => { const p = parseDate(v); return p ? p.y * 100 + p.m : ''; };",
  "  const fmtDate = (p) => p.y + '/' + String(p.m).padStart(2, '0') + '/' + String(p.d).padStart(2, '0');",
  "  const tierRank = (t) => { const i = TIERS.indexOf(t); return i < 0 ? 99 : i; };",
  "  const showNotice = (msg) => { const n = $('notice'); n.textContent = msg || ''; n.hidden = !msg; };",
  "",
  "  // ===== ティア判定（スプレッドシートの「ティア判定」と同じルール） =====",
  "  function buildIndex(months) {",
  "    const idx = { stat: {}, rank: {}, debut: {}, debutDate: {}, idsByMonth: {}, months: [], latestName: {}, latestMonth: {} };",
  "    const keys = Object.keys(months).map(Number).filter(Boolean).sort((a, b) => a - b);",
  "    keys.forEach((m) => {",
  "      const rows = (months[m] && months[m].rows) || [];",
  "      const ids = [];",
  "      rows.forEach((r) => {",
  "        const id = String(r[R.id] || '').trim();",
  "        if (!id) return;",
  "        const key = m + '|' + id;",
  "        const s = idx.stat[key] || (idx.stat[key] = { hours: 0, events: 0, gift: 0 });",
  "        s.hours += num(r[R.hours]); s.events += num(r[R.events]); s.gift += num(r[R.gift]);",
  "        if (!(key in idx.rank)) idx.rank[key] = r[R.rank] || '';",
  "        if (!(id in idx.debut)) {",
  "          const p = parseDate(r[R.debut]);",
  "          idx.debut[id] = p ? p.y * 100 + p.m : '';",
  "          idx.debutDate[id] = p ? fmtDate(p) : '';",
  "        }",
  "        if (ids.indexOf(id) < 0) ids.push(id);",
  "        idx.latestMonth[id] = m;",
  "        idx.latestName[id] = String(r[R.name] || '');",
  "      });",
  "      if (ids.length) { idx.idsByMonth[m] = ids; idx.months.push(m); }",
  "    });",
  "    return idx;",
  "  }",
  "  const stat = (idx, m, id) => idx.stat[m + '|' + id] || { hours: 0, events: 0, gift: 0 };",
  "",
  "  function judge(idx, id, ev, c) {",
  "    const F = idx.debut[id] || '';",
  "    const G = F === '' ? '' : monthDiff(ev, F);",
  "    const cur = stat(idx, ev, id);",
  "    const H = cur.hours, I = cur.events, J = cur.gift;",
  "    const K = stat(idx, addMonths(ev, -1), id).gift;",
  "    const L = stat(idx, addMonths(ev, -2), id).gift;",
  "    const M = (J + K + L) / 3;",
  "    const basic = H >= c.hours && I >= c.events;",
  "    const O = F === '' ? '' : stat(idx, F, id).hours;",
  "    const P = F === '' ? '' : stat(idx, F, id).events;",
  "    const Q = F === '' ? '' : Math.max(0, ...[0, 1, 2].map((k) => { const m = addMonths(F, k); return m > ev ? 0 : stat(idx, m, id).gift; }));",
  "    const Rx = Math.max(J, K, L);",
  "    let tier;",
  "    if (basic && M >= c.t1) tier = 'T1';",
  "    else if (basic && M >= c.t2) tier = 'T2';",
  "    else if (F !== '' && G < 0) tier = '未評価';",
  "    else if (F !== '' && Q >= c.t3) tier = 'T3';",
  "    else if (c.rescue && (F === '' || G >= 3) && Rx >= c.t3) tier = 'T3';",
  "    else if (F !== '' && G <= 2 && O >= c.hours && P >= c.events) tier = 'T4';",
  "    else tier = 'T5';",
  "",
  "    let reason;",
  "    if (tier === 'T1') reason = '基本条件◯・3ヶ月平均' + man(c.t1) + '以上';",
  "    else if (tier === 'T2') reason = '基本条件◯・3ヶ月平均' + man(c.t2) + '以上';",
  "    else if (tier === '未評価') reason = '評価月より後にデビュー';",
  "    else if (tier === 'T3') reason = F !== '' && Q >= c.t3 ? 'デビュー3ヶ月以内に月' + man(c.t3) + '達成' : '直近3ヶ月に月' + man(c.t3) + '達成（救済）';",
  "    else if (tier === 'T4') reason = '初月条件◯・月' + man(c.t3) + '達成待ち';",
  "    else reason = F !== '' && G <= 2 ? '初月条件✕（' + c.hours + 'h・イベント' + c.events + '回）' : '3ヶ月以内に月' + man(c.t3) + '未達';",
  "",
  "    const lack = basic ? '' : '・基本条件';",
  "    let next;",
  "    if (tier === 'T1') next = '維持';",
  "    else if (tier === 'T2') next = 'T1まで：3ヶ月平均あと' + yen(Math.max(0, c.t1 - M)) + '円' + lack;",
  "    else if (tier === 'T3') next = 'T2まで：3ヶ月平均あと' + yen(Math.max(0, c.t2 - M)) + '円' + lack;",
  "    else if (tier === 'T4') { const d = addMonths(F, 2); next = '月' + man(c.t3) + 'まであと' + yen(Math.max(0, c.t3 - J)) + '円（期限：' + monthLabel(d) + '）'; }",
  "    else if (tier === '未評価') next = '翌月に判定';",
  "    else next = '月' + c.hours + 'h・イベント' + c.events + '回・月' + man(c.t3) + 'を目指す';",
  "",
  "    return { id, name: idx.latestName[id] || id, rank: idx.rank[ev + '|' + id] || '', debutDate: idx.debutDate[id] || '', debutMonth: F, elapsed: G,",
  "      hours: H, events: I, sales: J, sales1: K, sales2: L, avg3: M, basic, firstHours: O, firstEvents: P, debutMax: Q, recentMax: Rx,",
  "      tier, reason, next, company: J * c.rate };",
  "  }",
  "  const judgeMonth = (idx, m, c) => (idx.idsByMonth[m] || []).map((id) => judge(idx, id, m, c));",
  "  function change(prev, cur) {",
  "    if (!prev) return '新規';",
  "    if (prev === '未評価' || cur === '未評価') return '—';",
  "    const d = tierRank(cur) - tierRank(prev);",
  "    return d < 0 ? '昇格' : d > 0 ? '降格' : '維持';",
  "  }",
  "",
  "  function computeView() {",
  "    const idx = state.idx;",
  "    const m = state.sel;",
  "    const prevM = addMonths(m, -1);",
  "    const prevMap = {};",
  "    const hasPrev = !!idx.idsByMonth[prevM];",
  "    if (hasPrev) judgeMonth(idx, prevM, state.criteria).forEach((x) => (prevMap[x.id] = x.tier));",
  "    const list = judgeMonth(idx, m, state.criteria).map((x) => {",
  "      x.prevTier = prevMap[x.id] || '';",
  "      x.change = hasPrev ? change(x.prevTier, x.tier) : '';",
  "      x.owner = (state.talents[x.id] && state.talents[x.id].owner) || '';",
  "      return x;",
  "    });",
  "    list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.sales - a.sales);",
  "    return { month: m, prevMonth: prevM, hasPrev, prevMap, list };",
  "  }",
  "",
  "  /** 評価月の既定：今月のデータしかない月（途中）は避けて、確定している最新月 */",
  "  function defaultMonth(months) {",
  "    if (state.criteria.evalMonth && months.indexOf(state.criteria.evalMonth) >= 0) return state.criteria.evalMonth;",
  "    const done = months.filter((m) => m < nowYm());",
  "    return done.length ? done[done.length - 1] : months[months.length - 1];",
  "  }",
  "",
  "  // ===== 描画 =====",
  "  function render() {",
  "    state.idx = buildIndex(state.months);",
  "    const months = state.idx.months;",
  "    const c = state.criteria;",
  "    $('criteria-line').textContent = '判定基準：月' + c.hours + 'h・イベント' + c.events + '回＋3ヶ月平均 T1 ' + man(c.t1) + '／T2 ' + man(c.t2) +",
  "      '、T3 月' + man(c.t3) + '（救済' + (c.rescue ? 'ON' : 'OFF') + '）、還元率' + Math.round(c.rate * 100) + '%';",
  "",
  "    if (!months.length) {",
  "      $('view').hidden = true;",
  "      $('empty').hidden = false;",
  "      $('tabs').replaceChildren();",
  "      $('btn-export').disabled = true;",
  "      $('empty-title').textContent = state.loaded ? 'まだ月次データがありません' : 'データを読み込んでいます…';",
  "      $('empty-text').textContent = state.loaded",
  "        ? '右上の「CSVを取り込む」から、REALITYの配信レポートCSVを入れてください。取り込んだ月がタブとして追加され、最新の確定月が表示されます。'",
  "        : '取り込んだ月がタブとして並び、選んだ月のT1〜T5のメンバーが表示されます。';",
  "      return;",
  "    }",
  "    if (!state.sel || months.indexOf(state.sel) < 0) state.sel = defaultMonth(months);",
  "    state.view = computeView();",
  "    $('empty').hidden = true;",
  "    $('view').hidden = false;",
  "    $('btn-export').disabled = false;",
  "    renderTabs(months);",
  "    renderStrip();",
  "    renderOwners();",
  "    renderBoard();",
  "    if (state.open) renderDrawer();",
  "  }",
  "",
  "  function renderTabs(months) {",
  "    const now = nowYm();",
  "    const tabs = months.slice().reverse().map((m) => el('button', {",
  "      class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(m === state.sel),",
  "      onclick: () => { state.sel = m; try { localStorage.setItem('reality-tier-month', String(m)); } catch (e) {} render(); },",
  "    }, [monthLabel(m), m >= now ? el('span', { class: 'partial', text: '途中' }) : null]));",
  "    $('tabs').replaceChildren(...tabs);",
  "  }",
  "",
  "  function renderStrip() {",
  "    const v = state.view;",
  "    const count = {}, prevCount = {};",
  "    v.list.forEach((x) => (count[x.tier] = (count[x.tier] || 0) + 1));",
  "    Object.values(v.prevMap).forEach((t) => (prevCount[t] = (prevCount[t] || 0) + 1));",
  "    const prevTotal = Object.keys(v.prevMap).length;",
  "    const cells = TIERS.map((t) => {",
  "      const n = count[t] || 0;",
  "      return el('div', { class: 'cell ' + TIER_CLASS[t] }, [",
  "        el('span', { class: 'lbl' }, [el('span', { class: 'dot', style: 'background:var(--c)' }), t]),",
  "        el('span', { class: 'val' }, [String(n), el('small', { text: '人' })]),",
  "        deltaEl(v.hasPrev, n - (prevCount[t] || 0), prevCount[t] || 0),",
  "      ]);",
  "    });",
  "    cells.push(el('div', { class: 'cell' }, [",
  "      el('span', { class: 'lbl', text: '在籍（合計）' }),",
  "      el('span', { class: 'val' }, [String(v.list.length), el('small', { text: '人' })]),",
  "      deltaEl(v.hasPrev, v.list.length - prevTotal, prevTotal),",
  "    ]));",
  "    $('strip').replaceChildren(...cells);",
  "",
  "    const mv = { 昇格: 0, 降格: 0, 新規: 0 };",
  "    v.list.forEach((x) => { if (x.change in mv) mv[x.change]++; });",
  "    const partial = v.month >= nowYm() ? '　※' + monthLabel(v.month) + 'は途中経過の数値です' : '';",
  "    $('moves').replaceChildren(...(v.hasPrev",
  "      ? [el('span', {}, ['評価月 ', el('b', { text: monthLabel(v.month) }), '（前月 ' + monthLabel(v.prevMonth) + ' と比較）' + partial]),",
  "         el('span', {}, ['昇格 ', el('b', { text: mv['昇格'] + '人' })]),",
  "         el('span', {}, ['降格 ', el('b', { text: mv['降格'] + '人' })]),",
  "         el('span', {}, ['新規 ', el('b', { text: mv['新規'] + '人' })])]",
  "      : [el('span', {}, ['評価月 ', el('b', { text: monthLabel(v.month) }), '（前月のデータがないため比較なし）' + partial])]));",
  "  }",
  "  function deltaEl(hasPrev, d, prev) {",
  "    if (!hasPrev) return el('span', { class: 'delta', text: '前月 —' });",
  "    const sign = d > 0 ? '+' + d : String(d);",
  "    return el('span', { class: 'delta' }, ['前月 ' + prev + '人 ', el('span', { class: d > 0 ? 'up' : d < 0 ? 'down' : '', text: d === 0 ? '±0' : sign })]);",
  "  }",
  "",
  "  function renderOwners() {",
  "    const sel = $('f-owner');",
  "    const cur = sel.value;",
  "    const owners = Array.from(new Set(Object.values(state.talents).map((t) => t.owner).filter(Boolean))).sort();",
  "    sel.replaceChildren(el('option', { value: '', text: '担当者：すべて' }), el('option', { value: '__none', text: '担当者：未設定' }),",
  "      ...owners.map((o) => el('option', { value: o, text: o })));",
  "    sel.value = owners.indexOf(cur) >= 0 || cur === '__none' ? cur : '';",
  "  }",
  "",
  "  function filtered() {",
  "    const q = $('q').value.trim().toLowerCase();",
  "    const owner = $('f-owner').value;",
  "    const ch = $('f-change').value;",
  "    return state.view.list.filter((x) =>",
  "      (!q || x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q)) &&",
  "      (!owner || (owner === '__none' ? !x.owner : x.owner === owner)) &&",
  "      (!ch || x.change === ch));",
  "  }",
  "",
  "  function renderBoard() {",
  "    const list = filtered();",
  "    const all = state.view.list.length;",
  "    $('meta').textContent = list.length === all ? all + '人' : list.length + '人 / ' + all + '人';",
  "    const c = state.criteria;",
  "    const desc = {",
  "      T1: '月' + c.hours + 'h・イベント' + c.events + '回＋3ヶ月平均' + man(c.t1) + '以上',",
  "      T2: '月' + c.hours + 'h・イベント' + c.events + '回＋3ヶ月平均' + man(c.t2) + '以上',",
  "      T3: 'デビュー3ヶ月以内に月' + man(c.t3) + (c.rescue ? '（既存は直近3ヶ月）' : ''),",
  "      T4: '初月' + c.hours + 'h・イベント' + c.events + '回／' + man(c.t3) + '待ち',",
  "      T5: '上記以外',",
  "      未評価: '評価月より後にデビュー',",
  "    };",
  "    const cols = TIERS.map((t) => {",
  "      const people = list.filter((x) => x.tier === t);",
  "      const items = people.map((x, i) => el('li', {}, [el('button', { class: 'person', type: 'button', onclick: () => openDrawer(x.id) }, [",
  "        el('span', { class: 'no', text: String(i + 1) }),",
  "        el('span', { class: 'nm', text: x.name, title: x.name }),",
  "        el('span', { class: 'sales', text: '¥' + yen(x.sales) + (x.owner ? '・' + x.owner : '') }),",
  "        changeChip(x),",
  "      ])]));",
  "      return el('section', { class: 'col ' + TIER_CLASS[t] }, [",
  "        el('div', { class: 'col-head' }, [el('h2', { text: t }), el('span', { class: 'count', text: people.length + '人' })]),",
  "        el('div', { class: 'col-desc', text: desc[t] }),",
  "        people.length ? el('ul', { class: 'list' }, items) : el('div', { class: 'empty-col', text: '該当者なし' }),",
  "      ]);",
  "    });",
  "    $('board').replaceChildren(...cols);",
  "  }",
  "  function changeChip(x) {",
  "    if (!x.change || x.change === '—') return x.prevTier ? el('span', { class: 'chip', text: x.prevTier }) : el('span');",
  "    if (x.change === '新規') return el('span', { class: 'chip new', text: '新規' });",
  "    if (x.change === '昇格') return el('span', { class: 'chip up', text: x.prevTier + '→' });",
  "    if (x.change === '降格') return el('span', { class: 'chip down', text: x.prevTier + '→' });",
  "    return el('span', { class: 'chip', text: '維持' });",
  "  }",
  "",
  "  // ===== 詳細パネル =====",
  "  function openDrawer(id) { state.open = id; renderDrawer(); }",
  "  function closeDrawer() { state.open = null; $('drawer').hidden = true; $('scrim').hidden = true; }",
  "  function renderDrawer() {",
  "    const x = state.view.list.find((p) => p.id === state.open);",
  "    const d = $('drawer');",
  "    if (!x) { closeDrawer(); return; }",
  "    const t = state.talents[x.id] || {};",
  "    const kv = (label, value, cls) => el('div', {}, [el('dt', { text: label }), el('dd', { class: cls || '', text: value })]);",
  "    const history = state.idx.months.filter((m) => state.idx.idsByMonth[m].indexOf(x.id) >= 0).reverse()",
  "      .map((m) => ({ m, j: judge(state.idx, x.id, m, state.criteria) }));",
  "    const ownerIn = el('input', { id: 'd-owner', list: 'owner-list', value: t.owner || '', placeholder: '例：井上' });",
  "    const memoIn = el('textarea', { id: 'd-memo', placeholder: '連絡したこと・次の打ち手など' });",
  "    memoIn.value = t.memo || '';",
  "    const msg = el('span', { class: 'saved' });",
  "    const save = el('button', { class: 'btn primary', type: 'submit', text: '保存', disabled: state.canWrite === false });",
  "    const owners = Array.from(new Set(Object.values(state.talents).map((v) => v.owner).filter(Boolean))).sort();",
  "",
  "    d.className = 'drawer ' + TIER_CLASS[x.tier];",
  "    d.replaceChildren(",
  "      el('div', { class: 'drawer-head' }, [",
  "        el('div', { class: 'row' }, [el('h2', { text: x.name }), el('button', { class: 'x', type: 'button', 'aria-label': '閉じる', onclick: closeDrawer, text: '×' })]),",
  "        el('div', { class: 'sub' }, [el('span', { class: 'badge', text: x.tier }), '　' + monthLabel(state.view.month) + '評価' +",
  "          (x.prevTier ? '・前月 ' + x.prevTier : '') + (x.change && x.change !== '—' ? '（' + x.change + '）' : '') + '　ID ' + x.id]),",
  "      ]),",
  "      el('div', { class: 'drawer-body' }, [",
  "        el('div', { class: 'reason' }, [el('b', { text: '判定理由' }), x.reason, el('b', { text: '次の目標' }), x.next]),",
  "        el('dl', { class: 'kv' }, [",
  "          kv('評価月 配信時間', fmtH(x.hours) + 'h', x.hours >= state.criteria.hours ? 'ok' : 'ng'),",
  "          kv('評価月 イベント数', x.events + '回', x.events >= state.criteria.events ? 'ok' : 'ng'),",
  "          kv('評価月 売上', '¥' + yen(x.sales)),",
  "          kv('3ヶ月平均 売上', '¥' + yen(x.avg3)),",
  "          kv('1ヶ月前 売上', '¥' + yen(x.sales1)),",
  "          kv('2ヶ月前 売上', '¥' + yen(x.sales2)),",
  "          kv('初配信日', x.debutDate || '不明'),",
  "          kv('経過月数', x.elapsed === '' ? '—' : x.elapsed + 'ヶ月'),",
  "          kv('初月 配信時間・イベント', x.firstHours === '' ? '—' : fmtH(x.firstHours) + 'h・' + x.firstEvents + '回'),",
  "          kv('デビュー3ヶ月内の最高月売上', x.debutMax === '' ? '—' : '¥' + yen(x.debutMax)),",
  "          kv('REALITYランク', x.rank || '—'),",
  "          kv('会社売上（評価月）', '¥' + yen(x.company)),",
  "        ]),",
  "        el('div', { class: 'section-title', text: '月ごとのティア' }),",
  "        el('div', { class: 'table-scroll' }, [el('table', { class: 'hist' }, [",
  "          el('thead', {}, [el('tr', {}, ['月', 'ティア', '配信時間', 'イベント', '売上'].map((h) => el('th', { text: h })))]),",
  "          el('tbody', {}, history.map(({ m, j }) => el('tr', { class: m === state.view.month ? 'sel' : '' }, [",
  "            el('td', { text: monthLabel(m) }),",
  "            el('td', {}, [el('span', { class: 'badge ' + TIER_CLASS[j.tier], text: j.tier })]),",
  "            el('td', { text: fmtH(j.hours) + 'h' }),",
  "            el('td', { text: j.events + '回' }),",
  "            el('td', { text: '¥' + yen(j.sales) }),",
  "          ]))),",
  "        ])]),",
  "        el('div', { class: 'section-title', text: '担当者・メモ' }),",
  "        el('form', { class: 'form', onsubmit: async (e) => {",
  "          e.preventDefault();",
  "          save.disabled = true; msg.textContent = '保存中…'; msg.style.color = '';",
  "          try {",
  "            const owner = ownerIn.value.trim();",
  "            await gs('webSaveTalent', x.id, owner, memoIn.value);",
  "            state.talents[x.id] = { owner, memo: memoIn.value };",
  "            msg.textContent = '保存しました（タレントマスタに反映）';",
  "            render();",
  "          } catch (err) {",
  "            msg.textContent = '保存できませんでした：' + errText(err);",
  "            msg.style.color = 'var(--down)';",
  "          } finally { save.disabled = false; }",
  "        } }, [",
  "          el('label', {}, ['担当者', ownerIn, el('datalist', { id: 'owner-list' }, owners.map((o) => el('option', { value: o })))]),",
  "          el('label', {}, ['メモ', memoIn]),",
  "          el('div', { class: 'dialog-actions' }, [msg, save]),",
  "        ]),",
  "      ]),",
  "    );",
  "    d.hidden = false;",
  "    $('scrim').hidden = false;",
  "  }",
  "",
  "  // ===== CSV の読み取り =====",
  "  function parseCsvText(text, delim) {",
  "    const rows = []; let row = [], f = '', q = false;",
  "    for (let i = 0; i < text.length; i++) {",
  "      const ch = text[i];",
  "      if (q) {",
  "        if (ch === '\"') { if (text[i + 1] === '\"') { f += '\"'; i++; } else q = false; } else f += ch;",
  "      } else if (ch === '\"') q = true;",
  "      else if (ch === delim) { row.push(f); f = ''; }",
  "      else if (ch === '\\n' || ch === '\\r') { if (ch === '\\r' && text[i + 1] === '\\n') i++; row.push(f); rows.push(row); row = []; f = ''; }",
  "      else f += ch;",
  "    }",
  "    if (f !== '' || row.length) { row.push(f); rows.push(row); }",
  "    return rows;",
  "  }",
  "  const norm = (s) => String(s == null ? '' : s).replace(/^\\uFEFF/, '')",
  "    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/[\\s　\"']/g, '').toLowerCase();",
  "  function findColumns(header) {",
  "    const n = header.map(norm); const out = {};",
  "    Object.keys(COLUMN_ALIASES).forEach((k) => {",
  "      const aliases = COLUMN_ALIASES[k].map(norm);",
  "      // 完全一致 → 「列名（単位）」のように後ろに括弧が付いた列 の順で探す",
  "      out[k] = -1;",
  "      aliases.some((a) => (out[k] = n.indexOf(a)) >= 0);",
  "      if (out[k] < 0) aliases.some((a) => (out[k] = n.findIndex((h) => h.startsWith(a + '('))) >= 0);",
  "    });",
  "    return out;",
  "  }",
  "  function parseHours(v, header) {",
  "    const s = String(v == null ? '' : v).trim();",
  "    if (!s) return 0;",
  "    let m = s.match(/^(\\d+):(\\d{1,2})(?::(\\d{1,2}))?$/);",
  "    if (m) return +m[1] + m[2] / 60 + (m[3] || 0) / 3600;",
  "    m = s.match(/^(?:(\\d+(?:\\.\\d+)?)\\s*時間)?\\s*(?:(\\d+(?:\\.\\d+)?)\\s*分)?\\s*(?:(\\d+(?:\\.\\d+)?)\\s*秒)?$/);",
  "    if (m && (m[1] || m[2] || m[3])) return +(m[1] || 0) + (m[2] || 0) / 60 + (m[3] || 0) / 3600;",
  "    const n = num(s), h = norm(header);",
  "    if (/分|min/.test(h)) return n / 60;",
  "    if (/秒|sec/.test(h)) return n / 3600;",
  "    return n;",
  "  }",
  "  function countEvents(v) {",
  "    const s = String(v == null ? '' : v).trim();",
  "    if (!s || s === '-' || s === '—' || s === 'なし') return 0;",
  "    if (/^\\d+(\\.\\d+)?\\s*(件|回)?$/.test(s)) return parseFloat(s);",
  "    return s.split(/[\\r\\n,、，;；|｜]+/).filter((x) => x.trim()).length;",
  "  }",
  "  function parseRealityCsv(text) {",
  "    text = String(text || '').replace(/^\\uFEFF/, '');",
  "    const first = text.split(/\\r?\\n/, 1)[0];",
  "    const delim = first.indexOf('\\t') >= 0 && first.indexOf(',') < 0 ? '\\t' : ',';",
  "    const rows = parseCsvText(text, delim).filter((r) => r.some((c) => String(c).trim() !== ''));",
  "    let at = -1, col = null;",
  "    for (let i = 0; i < Math.min(rows.length, 10) && at < 0; i++) {",
  "      const f = findColumns(rows[i]);",
  "      if (REQUIRED.every((k) => f[k] >= 0)) { at = i; col = f; }",
  "    }",
  "    if (at < 0) {",
  "      const f = findColumns(rows[0] || []);",
  "      const miss = REQUIRED.filter((k) => f[k] < 0).map((k) => COLUMN_ALIASES[k][0]);",
  "      throw new Error('列が見つかりません：' + miss.join('・') + '。CSVの列：' + (rows[0] || []).slice(0, 14).join(' / '));",
  "    }",
  "    const hh = String(rows[at][col.hours]);",
  "    const cell = (r, i) => (i >= 0 && i < r.length ? String(r[i] == null ? '' : r[i]).trim() : '');",
  "    const byId = new Map();",
  "    rows.slice(at + 1).forEach((r) => {",
  "      const id = cell(r, col.id);",
  "      if (!id) return;",
  "      const p = parseDate(cell(r, col.debut));",
  "      byId.set(id, [id, cell(r, col.name), cell(r, col.rank), num(cell(r, col.count)), Math.round(parseHours(cell(r, col.hours), hh) * 10000) / 10000,",
  "        num(cell(r, col.viewers)), num(cell(r, col.gift)), num(cell(r, col.score)), countEvents(cell(r, col.events)), p ? fmtDate(p) : '']);",
  "    });",
  "    return Array.from(byId.values());",
  "  }",
  "  function decode(buf) {",
  "    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('shift_jis').decode(buf); }",
  "  }",
  "",
  "  // ===== 取込ダイアログ =====",
  "  function openImport() {",
  "    state.pending = [];",
  "    $('file').value = '';",
  "    renderPending();",
  "    $('import-modal').hidden = false;",
  "  }",
  "  function closeImport() { $('import-modal').hidden = true; }",
  "  async function addFiles(files) {",
  "    for (const file of files) {",
  "      const item = { name: file.name, text: '', rows: null, error: '', month: '', start: '', end: '', status: '', sheet: '' };",
  "      try {",
  "        item.text = decode(await file.arrayBuffer());",
  "        item.rows = parseRealityCsv(item.text);",
  "        if (!item.rows.length) throw new Error('データ行がありません');",
  "        const m = file.name.match(/(\\d{8})\\D+(\\d{8})/);",
  "        if (m) { item.start = fmtDate(parseDate(m[1])); item.end = fmtDate(parseDate(m[2])); item.month = ymOf(m[1]); }",
  "        if (m && ymOf(m[1]) !== ymOf(m[2])) item.error = '期間が月をまたいでいます。月初からの累計CSVを入れてください';",
  "      } catch (e) { item.error = e.message || String(e); }",
  "      state.pending.push(item);",
  "    }",
  "    renderPending();",
  "  }",
  "  function renderPending() {",
  "    const box = $('files');",
  "    box.replaceChildren(...state.pending.map((it, i) => {",
  "      const parts = [el('div', { class: 'name', text: it.name })];",
  "      if (it.error) parts.push(el('div', { class: 'err', text: it.error }));",
  "      else {",
  "        const sum = it.rows.reduce((a, r) => a + num(r[R.gift]), 0);",
  "        parts.push(el('div', { class: 'info', text: it.rows.length + '人・ギフト合計 ¥' + yen(sum) + (it.start ? '・期間 ' + it.start + '〜' + it.end : '') }));",
  "        const monthIn = el('input', { type: 'month', 'aria-label': '対象月', value: it.month ? String(it.month).slice(0, 4) + '-' + String(it.month).slice(4) : '',",
  "          onchange: (e) => { const v = e.target.value; it.month = v ? Number(v.replace('-', '')) : ''; it.status = ''; renderPending(); } });",
  "        parts.push(el('label', { class: 'info' }, ['対象月 ', monthIn]));",
  "        const ex = it.month && state.months[it.month];",
  "        if (ex && ex.periodEnd && it.end && it.end < ex.periodEnd) parts.push(el('div', { class: 'warn', text: monthLabel(it.month) + 'は ' + ex.periodEnd + ' までの新しいデータが入っています。取り込むと古い数値に戻ります' }));",
  "        else if (ex) parts.push(el('div', { class: 'info', text: monthLabel(it.month) + 'のデータ（' + (ex.periodEnd ? ex.periodEnd + 'まで' : '取込済み') + '）を置き換えます' }));",
  "        if (!it.month) parts.push(el('div', { class: 'err', text: '対象月を選んでください' }));",
  "        if (it.status) parts.push(el('div', { class: it.status.startsWith('取り込みました') ? 'ok' : 'err', text: it.status }));",
  "        if (it.sheet) parts.push(el('div', { class: it.sheetOk ? 'info' : 'warn', text: it.sheet }));",
  "      }",
  "      parts.push(el('div', { class: 'dialog-actions' }, [el('button', { class: 'btn', type: 'button', text: '外す', onclick: () => { state.pending.splice(i, 1); renderPending(); } })]));",
  "      return el('div', { class: 'file' }, parts);",
  "    }));",
  "    const ready = state.pending.filter((it) => !it.error && it.month && !it.status.startsWith('取り込みました'));",
  "    $('imp-go').disabled = !ready.length;",
  "    $('imp-go').textContent = ready.length > 1 ? ready.length + '件を取り込む' : '取り込む';",
  "  }",
  "  async function runImport() {",
  "    const ready = state.pending.filter((it) => !it.error && it.month && !it.status.startsWith('取り込みました'));",
  "    if (!ready.length) return;",
  "    const pad = (n) => String(n).padStart(2, '0');",
  "    const files = ready.map((it) => {",
  "      let start = it.start, end = it.end;",
  "      if (!start || ymOf(start) !== it.month) {",
  "        const y = Math.floor(it.month / 100), m = it.month % 100;",
  "        start = y + '/' + pad(m) + '/01';",
  "        end = y + '/' + pad(m) + '/' + pad(new Date(y, m, 0).getDate());",
  "      }",
  "      return { name: it.name, text: it.text, start, end };",
  "    });",
  "    $('imp-go').disabled = true;",
  "    $('imp-go').textContent = '取り込み中…（30秒ほど）';",
  "    ready.forEach((it) => (it.status = ''));",
  "    try {",
  "      const messages = await gs('webImport', files);",
  "      // スプレッドシートからは「ファイル名：結果」の形で返る",
  "      ready.forEach((it) => {",
  "        const m = messages.find((x) => x.indexOf(it.name + '：') === 0);",
  "        const res = m ? m.slice(it.name.length + 1) : '結果を確認できませんでした';",
  "        it.status = res.indexOf('OK') === 0 ? '取り込みました（' + monthLabel(it.month) + '・' + res + '）' : res;",
  "      });",
  "      await reload();",
  "    } catch (e) {",
  "      ready.forEach((it) => (it.status = '取り込めませんでした：' + errText(e)));",
  "    }",
  "    renderPending();",
  "  }",
  "",
  "  // ===== 判定基準 =====",
  "  function openCriteria() {",
  "    const c = state.criteria;",
  "    $('c-hours').value = c.hours; $('c-events').value = c.events; $('c-t1').value = c.t1; $('c-t2').value = c.t2; $('c-t3').value = c.t3;",
  "    $('c-rate').value = Math.round(c.rate * 100); $('c-rescue').checked = !!c.rescue; $('cr-msg').textContent = '';",
  "    $('criteria-modal').hidden = false;",
  "  }",
  "  async function saveCriteria(e) {",
  "    e.preventDefault();",
  "    const body = { hours: num($('c-hours').value), events: num($('c-events').value), t1: num($('c-t1').value), t2: num($('c-t2').value),",
  "      t3: num($('c-t3').value), rate: num($('c-rate').value) / 100, rescue: $('c-rescue').checked };",
  "    const msg = $('cr-msg');",
  "    $('cr-save').disabled = true; msg.style.color = ''; msg.textContent = '保存中…（30秒ほど）';",
  "    try {",
  "      await gs('webSaveCriteria', body);",
  "      await reload();",
  "      msg.textContent = '保存しました（設定シートに反映）';",
  "    } catch (err) {",
  "      msg.style.color = 'var(--down)'; msg.textContent = '保存できませんでした：' + errText(err);",
  "    } finally { $('cr-save').disabled = false; }",
  "  }",
  "",
  "  // ===== CSV 書き出し =====",
  "  function exportMonth() {",
  "    if (!state.view) return;",
  "    const head = ['ID', '配信者名', '担当者', 'ティア', '前月ティア', '変化', 'REALITYランク', '初配信日', 'デビュー月', '経過月数', '配信時間（h）', 'イベント数',",
  "      '売上（円）', '1ヶ月前 売上（円）', '2ヶ月前 売上（円）', '3ヶ月平均 売上（円）', '基本条件', '初月 配信時間（h）', '初月 イベント数',",
  "      'デビュー3ヶ月内の最高月売上', '直近3ヶ月の最高月売上', '判定理由', '次のティアまで', '会社売上（円）'];",
  "    const q = (v) => { const s = String(v == null ? '' : v); return /[\",\\n]/.test(s) ? '\"' + s.replace(/\"/g, '\"\"') + '\"' : s; };",
  "    const lines = [head.map(q).join(',')].concat(state.view.list.map((x) => [x.id, x.name, x.owner, x.tier, x.prevTier, x.change, x.rank, x.debutDate, x.debutMonth, x.elapsed,",
  "      fmtH(x.hours), x.events, Math.round(x.sales), Math.round(x.sales1), Math.round(x.sales2), Math.round(x.avg3), x.basic ? '◯' : '✕',",
  "      x.firstHours === '' ? '' : fmtH(x.firstHours), x.firstEvents, x.debutMax === '' ? '' : Math.round(x.debutMax), Math.round(x.recentMax), x.reason, x.next, Math.round(x.company)].map(q).join(',')));",
  "    const blob = new Blob(['﻿' + lines.join('\\r\\n')], { type: 'text/csv' });",
  "    const a = el('a', { href: URL.createObjectURL(blob), download: 'REALITY_ティア_' + state.view.month + '.csv' });",
  "    document.body.append(a);",
  "    a.click();",
  "    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);",
  "  }",
  "",
  "  // ===== スプレッドシートとのやりとり =====",
  "  function gs(fn, ...args) {",
  "    return new Promise((resolve, reject) => {",
  "      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args);",
  "    });",
  "  }",
  "  function errText(e) { return (e && e.message) || String(e); }",
  "",
  "  /** スプレッドシートのデータを読み直して描画する */",
  "  async function reload() {",
  "    const data = await gs('webLoad');",
  "    const months = {};",
  "    (data.months || []).forEach((r) => {",
  "      const m = Number(r[0]);",
  "      (months[m] || (months[m] = { rows: [], periodEnd: (data.periods || {})[m] || '' })).rows.push(r.slice(1));",
  "    });",
  "    const talents = {};",
  "    (data.talents || []).forEach((t) => (talents[t[0]] = { owner: t[2] || '', memo: t[3] || '' }));",
  "    state.months = months;",
  "    state.talents = talents;",
  "    state.criteria = Object.assign({}, DEFAULT_CRITERIA, data.criteria || {});",
  "    state.sheetUrl = data.spreadsheetUrl || '';",
  "    state.loaded = true;",
  "    const last = (data.log || [])[0];",
  "    $('last-import').textContent = last ? '最終取込：' + last[0] + '（' + last[1] + '・' + last[4] + '）' : 'まだ取り込みはありません';",
  "    if (state.sheetUrl) { $('sheet-link').href = state.sheetUrl; $('sheet-link').hidden = false; }",
  "    render();",
  "  }",
  "",
  "  // ===== イベント =====",
  "  $('q').addEventListener('input', () => state.view && renderBoard());",
  "  $('f-owner').addEventListener('change', () => state.view && renderBoard());",
  "  $('f-change').addEventListener('change', () => state.view && renderBoard());",
  "  $('btn-import').addEventListener('click', openImport);",
  "  $('imp-close').addEventListener('click', closeImport);",
  "  $('imp-go').addEventListener('click', runImport);",
  "  $('file').addEventListener('change', (e) => addFiles(Array.from(e.target.files || [])));",
  "  const drop = $('drop');",
  "  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });",
  "  drop.addEventListener('dragleave', () => drop.classList.remove('over'));",
  "  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(Array.from(e.dataTransfer.files || [])); });",
  "  $('btn-criteria').addEventListener('click', openCriteria);",
  "  $('cr-close').addEventListener('click', () => ($('criteria-modal').hidden = true));",
  "  $('criteria-form').addEventListener('submit', saveCriteria);",
  "  $('btn-export').addEventListener('click', exportMonth);",
  "  $('scrim').addEventListener('click', closeDrawer);",
  "  document.addEventListener('keydown', (e) => {",
  "    if (e.key !== 'Escape') return;",
  "    if (!$('import-modal').hidden) closeImport();",
  "    else if (!$('criteria-modal').hidden) $('criteria-modal').hidden = true;",
  "    else if (state.open) closeDrawer();",
  "  });",
  "",
  "  // ===== 起動 =====",
  "  render();",
  "  reload().catch((e) => {",
  "    state.loaded = true;",
  "    showNotice('スプレッドシートを読み込めませんでした：' + errText(e) + '。ページを再読み込みしてください。');",
  "    render();",
  "  });",
  "})();",
  "</script>",
].join('\n');
// </APP_HTML>
