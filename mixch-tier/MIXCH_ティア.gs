// ミクチャ ティア判定：月次CSV取込・ティア自動判定・売上ダッシュボード（大元／ぷち）・社内向けアプリ
//
// 新しい Google スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使います。
//   1. 貼り付けて保存し、関数「setupMixch」を実行（必要なシートを自動で作る・権限を許可）
//   2. スプレッドシートを開き直すとメニュー「ミクチャ取込」が出る
//   3. メニュー「ミクチャcsvのスプシから取り込む（大元・ぷちの全月）」で過去の月をまとめて入れる
//   4. 以降は「CSVをアップロードして取込…」またはアプリの「CSVを取り込む」で月次CSVを入れる
//   5. アプリとして使うときは「デプロイ → 新しいデプロイ → ウェブアプリ」
//      （次のユーザーとして実行：自分／アクセスできるユーザー：株式会社LIV 内の全員）
//
// ティアのルールは「NEXT_ミクチャ_Tier表」と同じ（ティア1／ティア1候補／ティア2／ティア3／パーソナル枠／ティア外）。

// ===== 設定 ===============================================================

/** 過去の月次CSVを貼ってある「ミクチャcsv」スプレッドシート（シート名：大元10月、ぷち9月 など） */
const MX_CSV_SHEET_ID = '1W8aPF6tu8a6w0py5rBWq2kZSDJyrN9KHsQms2AvbVhE';

const MX_SHEET = {
  settings: '設定',
  master: 'タレントマスタ',
  monthly: '月次RAW',
  log: '取込ログ',
  judge: 'ティア判定',
  board: 'タレント分け',
  sales: '売上ダッシュボード',
};
const MX_TZ = 'Asia/Tokyo';
const MX_TIERS = ['ティア1', 'ティア1候補', 'ティア2', 'ティア3', 'パーソナル枠', 'ティア外'];
const MX_TIER_COLOR = {
  ティア1: '#FCE8B2', ティア1候補: '#FFF2CC', ティア2: '#D9EAD3', ティア3: '#CFE2F3', パーソナル枠: '#EAD1DC', ティア外: '#EFEFEF',
};
const MX_HEADER_BG = '#C2185B';
const MX_GROUP_COLOR = ['#C2185B', '#F48FB1', '#7E57C2', '#90A4AE'];
/** 月次RAW の列 */
const MX_MONTHLY_HEAD = ['月キー', 'ユーザーID', 'ユーザー名', '区分', '所属プロモーター名', '契約形態', 'プロモーター獲得分（税抜）',
  'ライバー獲得分（税抜）', '売上（合計）', 'ライブ配信回数', 'ライブ配信時間（h）', '動画投稿回数', '振込金額（税調整後）', '取込'];
/** タレントマスタの列（5行目から） */
const MX_MASTER_HEAD = ['ユーザーID', '配信者名', '担当者', 'パーソナル枠（○）', 'イベント3回（○／×）', 'ティア入り月（特例・既存 例：2026/08）',
  'メモ', '本部長承認（ティア1：○）', 'デビュー月（手入力 例：2026/10）', '追加日'];
const MX_MASTER_FIRST_ROW = 5;

// ===== メニュー・初期設定 ===================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ミクチャ取込')
    .addItem('CSVをアップロードして取込…', 'mxShowUploadDialog')
    .addItem('ミクチャcsvのスプシから取り込む（大元・ぷちの全月）', 'mxImportFromCsvSheet')
    .addSeparator()
    .addItem('ティア判定・ダッシュボードを更新', 'mxRefreshAll')
    .addItem('はじめての設定（シートを作る）', 'setupMixch')
    .addToUi();
}

/** B3（表示する月）を変えたらそのシートを作り直す */
function onEdit(e) {
  if (!e || !e.range || e.range.getA1Notation() !== 'B3') return;
  const name = e.range.getSheet().getName();
  const month = mxParseMonthLabel_(e.range.getValue());
  if (name === MX_SHEET.judge) mxRenderJudge_(e.source, month);
  if (name === MX_SHEET.board) mxRenderBoard_(e.source, month);
  if (name === MX_SHEET.sales) mxRenderSales_(e.source, month);
}

/** 必要なシートを作る（あるものはそのまま） */
function setupMixch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  mxEnsureSheets_(ss);
  ss.toast('シートを用意しました。メニュー「ミクチャ取込」から CSV を取り込んでください（メニューが出ないときは再読み込み）', 'ミクチャ', 8);
}

function mxEnsureSheets_(ss) {
  let s = ss.getSheetByName(MX_SHEET.settings);
  if (!s) {
    s = ss.insertSheet(MX_SHEET.settings);
    s.getRange('A1').setValue('設定（黄色のセルは変更できます）').setFontWeight('bold').setFontSize(14);
    s.getRange('A3:C3').setValues([['項目', '値', '説明']]);
    s.getRange('A4:C12').setValues([
      ['ティア入り：月の配信時間（h）', 60, '初月（既存は任意の月）にこの時間以上でティア入り'],
      ['ティア入り：月のイベント参加（回）', 3, 'イベントはCSVにないので、タレントマスタで未達なら「×」'],
      ['ティア2：月売上（円）', 250000, '売上＝プロモーター獲得分＋ライバー獲得分（税抜）'],
      ['ティア1：月売上（円）', 500000, '本部長承認○でティア1、それまではティア1候補'],
      ['初月ルールの開始月（yyyymm）', 202610, 'この月以降にデビューした人は、デビュー月の達成のみでティア入り'],
      ['評価月（手動指定・空欄なら自動）', '', '例：202609。空欄なら今月より前の最新月（なければ最新月）'],
      ['目標人数：ティア1', 3, ''],
      ['目標人数：ティア2', 5, ''],
      ['目標人数：ティア3', 15, 'TS目標（毎月追う数字）'],
    ]);
    s.getRange('A14:B14').setValues([['CSVの所属プロモーター名', '区分（表示名）']]);
    s.getRange('A15:B16').setValues([['アソビシステム株式会社(ASOBINEXT)', '大元'], ['アソビシステム株式会社-ASOBINEXT-', 'ぷち']]);
    mxHeader_(s.getRange('A3:C3'));
    mxHeader_(s.getRange('A14:B14'));
    s.getRange('B4:B12').setBackground('#FFF2CC').setFontColor('#1155CC');
    s.getRange('A15:B30').setBackground('#FFF2CC');
    s.getRange('B6:B7').setNumberFormat('#,##0');
    s.setColumnWidth(1, 300);
    s.setColumnWidth(2, 160);
    s.setColumnWidth(3, 460);
  }
  s = ss.getSheetByName(MX_SHEET.master);
  if (!s) {
    s = ss.insertSheet(MX_SHEET.master);
    s.getRange('A1').setValue('タレントマスタ（手入力）').setFontWeight('bold').setFontSize(14);
    s.getRange('A2').setValue('担当者・パーソナル枠・イベント・ティア入り月（特例）・本部長承認・デビュー月・メモをここに入力します（IDで紐づくので、CSVの並びが変わってもずれません）。新しいIDは取込時に自動で追加されます。');
    mxHeader_(s.getRange(4, 1, 1, MX_MASTER_HEAD.length).setValues([MX_MASTER_HEAD]));
    s.getRange('C:I').setBackground('#FFF2CC');
    s.getRange('A:A').setNumberFormat('@');
    s.getRange('F:F').setNumberFormat('@');
    s.getRange('I:I').setNumberFormat('@');
    s.setColumnWidth(2, 220);
    s.setColumnWidths(3, 7, 140);
    s.setFrozenRows(4);
  }
  s = ss.getSheetByName(MX_SHEET.monthly);
  if (!s) {
    s = ss.insertSheet(MX_SHEET.monthly);
    mxHeader_(s.getRange(1, 1, 1, MX_MONTHLY_HEAD.length).setValues([MX_MONTHLY_HEAD]));
    s.getRange('B:B').setNumberFormat('@');
    s.setFrozenRows(1);
  }
  s = ss.getSheetByName(MX_SHEET.log);
  if (!s) {
    s = ss.insertSheet(MX_SHEET.log);
    mxHeader_(s.getRange('A1:E1').setValues([['取込日時', 'ファイル名', '対象月', '行数', '結果']]));
    s.setFrozenRows(1);
  }
  [MX_SHEET.judge, MX_SHEET.board, MX_SHEET.sales].forEach(function (n) {
    if (!ss.getSheetByName(n)) ss.insertSheet(n);
  });
  const blank = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
}

// ===== 取込 ================================================================

function mxShowUploadDialog() {
  const html = HtmlService.createHtmlOutput(MX_UPLOAD_HTML_).setWidth(560).setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html, 'ミクチャの月次CSVを取り込む');
}

/**
 * files: [{name, text, month}]（month は yyyymm）→ 「ファイル名：結果」の一覧
 * 同じ月・同じ区分（大元／ぷち）のデータは、新しいCSVでまるごと置き換える（月の途中のCSVを何度入れてもOK）
 */
function mxImportFiles(files) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  mxEnsureSheets_(ss);
  const messages = [];
  mxWithLock_(function () {
    let imported = 0;
    (files || []).forEach(function (f) {
      const res = mxImportOne_(ss, f.text, f.name, Number(String(f.month || '').replace(/\D/g, '')));
      if (res.ok) imported++;
      messages.push(f.name + '：' + res.message);
    });
    if (imported) mxRefreshAll_(ss);
  });
  return messages;
}

function mxImportOne_(ss, text, fileName, month) {
  try {
    if (!(month > 200001 && month % 100 >= 1 && month % 100 <= 12)) throw new Error('対象月がありません');
    const recs = mxParseCsv_(text);
    if (!recs.length) throw new Error('データ行がありません');
    const labels = mxPromoterLabels_(ss);
    const byGroup = {};
    recs.forEach(function (r) {
      r.label = labels[r.promoter] || r.promoter || '（プロモーターなし）';
      (byGroup[r.label] || (byGroup[r.label] = [])).push(r);
    });
    mxReplaceMonthly_(ss, month, byGroup, fileName);
    mxUpsertMaster_(ss, recs);
    const detail = Object.keys(byGroup).map(function (g) { return g + ' ' + byGroup[g].length + '人'; }).join('・');
    const msg = 'OK・' + mxMonthLabel_(month) + '（' + detail + '）';
    mxLog_(ss, fileName, month, recs.length, msg);
    return { ok: true, message: msg };
  } catch (err) {
    const msg = 'エラー：' + (err && err.message ? err.message : err);
    mxLog_(ss, fileName, month || '', 0, msg);
    return { ok: false, message: msg };
  }
}

/** 月次RAW：その月の、CSVに含まれる区分の行をまるごと置き換える */
function mxReplaceMonthly_(ss, month, byGroup, fileName) {
  const sheet = ss.getSheetByName(MX_SHEET.monthly);
  const width = MX_MONTHLY_HEAD.length;
  const last = sheet.getLastRow();
  const kept = last >= 2
    ? sheet.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
        return r[0] !== '' && !(Number(r[0]) === month && String(r[3]) in byGroup);
      })
    : [];
  const stamp = Utilities.formatDate(new Date(), MX_TZ, 'yyyy/MM/dd HH:mm') + '（' + fileName + '）';
  let fresh = [];
  Object.keys(byGroup).forEach(function (g) {
    fresh = fresh.concat(byGroup[g].slice().sort(function (a, b) { return b.sales - a.sales; }).map(function (r) {
      return [month, r.id, r.name, g, r.promoter, r.contract, r.pro, r.liver, r.pro + r.liver, r.count, r.hours, r.videos, r.payout, stamp];
    }));
  });
  const all = kept.concat(fresh);
  all.sort(function (a, b) { return Number(a[0]) - Number(b[0]); });
  mxEnsureRows_(sheet, all.length + 1);
  if (last >= 2) sheet.getRange(2, 1, last - 1, width).clearContent();
  if (all.length) {
    sheet.getRange(2, 2, all.length, 4).setNumberFormat('@');
    sheet.getRange(2, 1, all.length, width).setValues(all);
  }
}

/** タレントマスタ：新しいIDを追加し、配信者名を最新に（手入力の列は触らない） */
function mxUpsertMaster_(ss, recs) {
  const sheet = ss.getSheetByName(MX_SHEET.master);
  const last = Math.max(sheet.getLastRow(), MX_MASTER_FIRST_ROW - 1);
  const n = last - MX_MASTER_FIRST_ROW + 1;
  const cur = n > 0 ? sheet.getRange(MX_MASTER_FIRST_ROW, 1, n, 2).getValues() : [];
  const rowById = {};
  let lastRow = MX_MASTER_FIRST_ROW - 1;
  cur.forEach(function (r, i) {
    const id = String(r[0]).trim();
    if (!id) return;
    rowById[id] = i;
    lastRow = MX_MASTER_FIRST_ROW + i;
  });
  let changed = false;
  const added = [];
  const today = Utilities.formatDate(new Date(), MX_TZ, 'yyyy/MM/dd');
  recs.forEach(function (r) {
    if (r.id in rowById) {
      if (rowById[r.id] >= 0 && r.name && cur[rowById[r.id]][1] !== r.name) {
        cur[rowById[r.id]][1] = r.name;
        changed = true;
      }
    } else {
      rowById[r.id] = -1;
      added.push([r.id, r.name, '', '', '', '', '', '', '', today]);
    }
  });
  if (changed) sheet.getRange(MX_MASTER_FIRST_ROW, 2, cur.length, 1).setNumberFormat('@').setValues(cur.map(function (r) { return [r[1]]; }));
  if (added.length) {
    mxEnsureRows_(sheet, lastRow + added.length);
    sheet.getRange(lastRow + 1, 1, added.length, 2).setNumberFormat('@');
    sheet.getRange(lastRow + 1, 1, added.length, added[0].length).setValues(added);
  }
}

/** 「ミクチャcsv」スプレッドシートの「大元10月」「ぷち9月」…のシートをまとめて取り込む */
function mxImportFromCsvSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  mxEnsureSheets_(ss);
  const src = SpreadsheetApp.openById(MX_CSV_SHEET_ID);
  const now = new Date();
  const messages = [];
  mxWithLock_(function () {
    src.getSheets().forEach(function (s) {
      const m = s.getName().match(/(\d{1,2})\s*月/);
      if (!m || s.getLastRow() < 2) return;
      const mon = Number(m[1]);
      const month = (mon > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear()) * 100 + mon;
      // 時間（1 day, 17:56:24 など）を表示どおりに読むため、表示値を CSV と同じ形にして使う
      const values = s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).getDisplayValues();
      const text = values.map(function (r) {
        return r.map(function (c) { return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
      }).join('\n');
      const res = mxImportOne_(ss, text, s.getName(), month);
      messages.push(s.getName() + '：' + res.message);
    });
    mxRefreshAll_(ss);
  });
  ss.toast(messages.join('\n') || '取り込めるシートがありませんでした', 'ミクチャcsv から取込', 10);
}

function mxLog_(ss, fileName, month, rows, result) {
  ss.getSheetByName(MX_SHEET.log).appendRow([new Date(), fileName, month ? mxMonthLabel_(month) : '', rows, result]);
}

// ===== CSV の読み取り ======================================================

const MX_COLUMNS = {
  id: ['ユーザーID'],
  name: ['ユーザー名'],
  promoter: ['所属プロモーター名'],
  contract: ['契約形態'],
  payout: ['ライバー獲得分+プロモーター獲得分の振込金額（税調整後）'],
  pro: ['プロモーター獲得分（税抜）'],
  liver: ['ライバー獲得分（税抜）'],
  count: ['ライブ配信回数'],
  hours: ['ライブ配信時間'],
  videos: ['動画投稿回数'],
};

function mxParseCsv_(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = mxCsvRows_(text).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  const norm = function (s) {
    return String(s == null ? '' : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[\s　]/g, '').toLowerCase();
  };
  let at = -1;
  let col = {};
  for (let i = 0; i < Math.min(rows.length, 10) && at < 0; i++) {
    const h = rows[i].map(norm);
    const found = {};
    Object.keys(MX_COLUMNS).forEach(function (k) {
      found[k] = -1;
      MX_COLUMNS[k].some(function (a) { found[k] = h.indexOf(norm(a)); return found[k] >= 0; });
    });
    if (found.id >= 0 && found.pro >= 0 && found.liver >= 0 && found.hours >= 0) {
      at = i;
      col = found;
    }
  }
  if (at < 0) {
    throw new Error('列が見つかりません（ユーザーID・プロモーター獲得分（税抜）・ライバー獲得分（税抜）・ライブ配信時間が必要）。CSVの列：' +
      (rows[0] || []).slice(0, 12).join(' / '));
  }
  const cell = function (r, i) { return i >= 0 && i < r.length ? String(r[i] == null ? '' : r[i]).trim() : ''; };
  const byId = {};
  const order = [];
  rows.slice(at + 1).forEach(function (r) {
    let id = cell(r, col.id).replace(/\.0+$/, '');
    if (!id || id === 'ユーザーID') return; // 見出しが2回貼られていても飛ばす
    const rec = {
      id: id, name: cell(r, col.name), promoter: cell(r, col.promoter), contract: cell(r, col.contract),
      pro: mxNum_(cell(r, col.pro)), liver: mxNum_(cell(r, col.liver)), payout: mxNum_(cell(r, col.payout)),
      count: mxNum_(cell(r, col.count)), hours: mxHours_(cell(r, col.hours)), videos: mxNum_(cell(r, col.videos)),
    };
    rec.sales = rec.pro + rec.liver;
    if (!(id in byId)) order.push(id);
    byId[id] = rec;
  });
  return order.map(function (id) { return byId[id]; });
}

/** "1 day, 17:56:24"・"2 days, 3:54:00"・"41:56:24"・"7:37:50" → 時間 */
function mxHours_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  const m = s.match(/^(?:(\d+)\s*days?,?\s*)?(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return Math.round((Number(m[1] || 0) * 24 + Number(m[2]) + Number(m[3]) / 60 + Number(m[4] || 0) / 3600) * 10000) / 10000;
  return mxNum_(s);
}

function mxCsvRows_(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// ===== ティア判定（アプリの画面でも同じ関数を使う） ==========================
// ここから「mxShared」の終わりまでの関数は、アプリの画面にもそのまま埋め込まれる（GAS の関数に頼らない書き方にする）

/** 月次RAWの行 [月キー, ID, 名前, 区分, プロモーター, 契約, プロ獲得, ライバー獲得, 売上, 回数, 時間, 動画] から索引を作る */
function mxBuildIndex(rows) {
  const idx = { months: [], ids: {}, stat: {}, name: {}, group: {} };
  rows.slice().sort(function (a, b) { return Number(a[0]) - Number(b[0]); }).forEach(function (r) {
    const m = Number(r[0]);
    const id = String(r[1] == null ? '' : r[1]).trim();
    if (!m || !id) return;
    const key = m + '|' + id;
    const s = idx.stat[key] || (idx.stat[key] = { hours: 0, sales: 0, company: 0, liver: 0, count: 0, videos: 0, group: '' });
    s.hours += Number(r[10]) || 0;
    s.sales += Number(r[8]) || 0;
    s.company += Number(r[6]) || 0;
    s.liver += Number(r[7]) || 0;
    s.count += Number(r[9]) || 0;
    s.videos += Number(r[11]) || 0;
    s.group = String(r[3] || '');
    if (!idx.ids[m]) { idx.ids[m] = []; idx.months.push(m); }
    if (idx.ids[m].indexOf(id) < 0) idx.ids[m].push(id);
    idx.name[id] = String(r[2] || '');
    idx.group[id] = String(r[3] || '');
  });
  return idx;
}

function mxAddMonths(ym, k) {
  const t = Math.floor(ym / 100) * 12 + (ym % 100) - 1 + k;
  return Math.floor(t / 12) * 100 + (t % 12) + 1;
}

function mxMonthLabel(ym) {
  return Math.floor(ym / 100) + '年' + (ym % 100) + '月';
}

/** "2026/10"・"202610"・"10"（今月以前の直近のその月）→ yyyymm */
function mxParseYm(v, refYm) {
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})\D+(\d{1,2})/) || s.match(/^(\d{4})(\d{2})$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = s.match(/^(\d{1,2})月?$/);
  if (m && refYm) {
    const mon = Number(m[1]);
    const y = Math.floor(refYm / 100);
    return (mon > refYm % 100 ? y - 1 : y) * 100 + mon;
  }
  return null;
}

/**
 * 1人を評価月 M で判定する（Tier表の「ティア判定」「集計」シートの数式と同じ）
 * master: {owner, personal, event, special, memo, approve, debut}
 */
function mxJudge(idx, id, M, cfg, master) {
  master = master || {};
  const st = function (m) { return idx.stat[m + '|' + id] || { hours: 0, sales: 0, company: 0, liver: 0, count: 0, videos: 0 }; };
  const cur = st(M);
  const hours = cur.hours;
  const sales = cur.sales;
  const recent = hours + st(mxAddMonths(M, -1)).hours + st(mxAddMonths(M, -2)).hours;
  let first60 = null;
  let firstLive = null;
  idx.months.forEach(function (m) {
    const h = st(m).hours;
    if (first60 === null && h >= cfg.hours) first60 = m;
    if (firstLive === null && h > 0) firstLive = m;
  });
  const debut = mxParseYm(master.debut, M) || firstLive;
  let entry = null; // ティア入り月（自動）
  if (debut) entry = debut >= cfg.start ? (st(debut).hours >= cfg.hours ? debut : null) : first60;
  const entryShown = entry && entry <= M ? entry : null;
  const special = String(master.special || '').trim();
  const event = String(master.event || '').trim();
  const tiered = (special !== '' || (entryShown && event !== '×')) && recent > 0;
  let tier;
  if (tiered) {
    if (sales >= cfg.t1) tier = String(master.approve || '').trim() === '○' ? 'ティア1' : 'ティア1候補';
    else if (sales >= cfg.t2) tier = 'ティア2';
    else tier = 'ティア3';
  } else {
    tier = String(master.personal || '').trim() === '○' ? 'パーソナル枠' : 'ティア外';
  }
  // 初月判定
  let shoki = '';
  if (debut) {
    if (debut < cfg.start) shoki = '既存（従来ルール）';
    else if (debut > M) shoki = '';
    else if (entry && event !== '×') shoki = '達成';
    else if (debut === M) shoki = '初月中（あと' + Math.max(0, cfg.hours - hours).toFixed(1) + 'h）';
    else shoki = '未達→ティア外';
  }
  const yen = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  let reason;
  let next;
  if (tier === 'ティア外' && shoki.indexOf('未達') === 0) {
    reason = '初月未達のためティア対象外（特例のみ）';
    next = 'SNS・アイドル側に重点';
  } else if (tier === 'ティア外' && shoki.indexOf('初月中') === 0) {
    reason = '初月チャレンジ中（' + cfg.hours + 'h・イベント' + cfg.events + '回）';
    next = '今月中に配信あと' + Math.max(0, cfg.hours - hours).toFixed(1) + 'h・イベント' + cfg.events + '回';
  } else if (tier === 'ティア1') {
    reason = 'ティア入り済み・月売上' + cfg.t1 / 10000 + '万以上・本部長承認済み';
    next = '維持';
  } else if (tier === 'ティア1候補') {
    reason = '月売上' + cfg.t1 / 10000 + '万以上（本部長承認待ち）';
    next = '25日に本部長へ報告→承認でティア1';
  } else if (tier === 'ティア2') {
    reason = 'ティア入り済み・月売上' + cfg.t2 / 10000 + '万以上';
    next = '月売上あと' + yen(cfg.t1 - sales) + '円';
  } else if (tier === 'ティア3') {
    reason = 'ティア入り済み（' + (special || mxMonthLabel(entryShown)) + '）' + (!special && !event ? '※イベント未確認' : '');
    next = '月売上あと' + yen(cfg.t2 - sales) + '円';
  } else if (tier === 'パーソナル枠') {
    reason = 'パーソナル枠（手入力）';
    next = '配信あと' + Math.max(0, cfg.hours - hours).toFixed(1) + 'h・イベント' + cfg.events + '回';
  } else {
    reason = sales >= cfg.t2 ? '売上はティア' + (sales >= cfg.t1 ? '1' : '2') + '水準・ティア入り条件が未達' : 'ティア入り条件（初月' + cfg.hours + 'h・イベント' + cfg.events + '回）が未達';
    next = '配信あと' + Math.max(0, cfg.hours - hours).toFixed(1) + 'h・イベント' + cfg.events + '回';
  }
  return {
    id: id, name: idx.name[id] || id, group: (idx.stat[M + '|' + id] || {}).group || idx.group[id] || '',
    count: cur.count, hours: hours, sales: sales, company: cur.company, liver: cur.liver, videos: cur.videos,
    sales1: st(mxAddMonths(M, -1)).sales, sales2: st(mxAddMonths(M, -2)).sales, recent: recent,
    entry: entryShown, special: special, event: event, personal: master.personal || '', approve: master.approve || '',
    debut: debut, shoki: shoki, tier: tier, reason: reason, next: next, owner: master.owner || '', memo: master.memo || '',
  };
}

/** 評価月 M の全員（その月のCSVにいる人）をティア順・売上順で判定 */
function mxJudgeMonth(idx, M, cfg, masters) {
  return (idx.ids[M] || []).map(function (id) { return mxJudge(idx, id, M, cfg, masters[id]); }).sort(function (a, b) {
    return MX_TIERS.indexOf(a.tier) - MX_TIERS.indexOf(b.tier) || b.sales - a.sales;
  });
}

/** 表示する月の既定：設定の評価月 → 今月より前の最新月 → 最新月 */
function mxDefaultMonth(idx, cfg, nowYm) {
  if (!idx.months.length) return null;
  if (cfg.evalMonth && idx.ids[cfg.evalMonth]) return cfg.evalMonth;
  const done = idx.months.filter(function (m) { return m < nowYm; });
  return done.length ? done[done.length - 1] : idx.months[idx.months.length - 1];
}
// ===== mxShared の終わり ====================================================

// ===== シートの読み書き ====================================================

function mxReadConfig_(ss) {
  const v = ss.getSheetByName(MX_SHEET.settings).getRange('B4:B12').getValues().map(function (r) { return r[0]; });
  return {
    hours: mxNum_(v[0]) || 60, events: mxNum_(v[1]) || 3, t2: mxNum_(v[2]) || 250000, t1: mxNum_(v[3]) || 500000,
    start: mxParseYm(v[4], null) || 202610, evalMonth: mxParseYm(v[5], null),
    targets: { ティア1: mxNum_(v[6]), ティア2: mxNum_(v[7]), ティア3: mxNum_(v[8]) },
  };
}

function mxPromoterLabels_(ss) {
  const s = ss.getSheetByName(MX_SHEET.settings);
  const out = {};
  if (s.getLastRow() < 15) return out;
  s.getRange(15, 1, s.getLastRow() - 14, 2).getValues().forEach(function (r) {
    if (String(r[0]).trim()) out[String(r[0]).trim()] = String(r[1]).trim() || String(r[0]).trim();
  });
  return out;
}

function mxReadMonthly_(ss) {
  const s = ss.getSheetByName(MX_SHEET.monthly);
  return s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, 12).getValues();
}

function mxReadMasters_(ss) {
  const s = ss.getSheetByName(MX_SHEET.master);
  const out = {};
  if (s.getLastRow() < MX_MASTER_FIRST_ROW) return out;
  s.getRange(MX_MASTER_FIRST_ROW, 1, s.getLastRow() - MX_MASTER_FIRST_ROW + 1, 9).getDisplayValues().forEach(function (r) {
    const id = String(r[0]).trim();
    if (id) out[id] = { name: r[1], owner: r[2], personal: r[3], event: r[4], special: r[5], memo: r[6], approve: r[7], debut: r[8] };
  });
  return out;
}

function mxContext_(ss, month) {
  const cfg = mxReadConfig_(ss);
  const idx = mxBuildIndex(mxReadMonthly_(ss));
  const nowYm = mxYm_(new Date());
  if (!month || !idx.ids[month]) month = mxDefaultMonth(idx, cfg, nowYm);
  return { cfg: cfg, idx: idx, month: month, masters: mxReadMasters_(ss), nowYm: nowYm };
}

// ===== 表示（シート） ======================================================

function mxRefreshAll() {
  mxRefreshAll_(SpreadsheetApp.getActiveSpreadsheet());
}

function mxRefreshAll_(ss) {
  SpreadsheetApp.flush();
  const pick = function (name) {
    const s = ss.getSheetByName(name);
    return s ? mxParseMonthLabel_(s.getRange('B3').getValue()) : null;
  };
  mxRenderJudge_(ss, pick(MX_SHEET.judge));
  mxRenderBoard_(ss, pick(MX_SHEET.board));
  mxRenderSales_(ss, pick(MX_SHEET.sales));
}

/** シートを白紙にして、タイトルと月の選択（B3）を置く */
function mxStartSheet_(ss, name, title, note, ctx) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);
  mxEnsureCols_(sheet, 26);
  sheet.getRange('B1:M1').merge().setValue(title).setFontSize(16).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(MX_HEADER_BG);
  sheet.setRowHeight(1, 38);
  sheet.getRange('B2:M2').merge().setValue(note).setFontSize(9).setFontColor('#666666');
  const months = ctx.idx.months.slice().reverse().map(mxMonthLabel);
  if (months.length) {
    sheet.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(months, true).build())
      .setNumberFormat('@').setValue(mxMonthLabel(ctx.month)).setBackground('#FFF2CC').setFontWeight('bold').setFontColor('#1155CC');
    sheet.getRange('C3').setValue('← 月を選ぶと切り替わります' + (ctx.month >= ctx.nowYm ? '（今月は途中経過）' : ''))
      .setFontSize(9).setFontColor(ctx.month >= ctx.nowYm ? '#CC0000' : '#666666');
  }
  return sheet;
}

/** ティア判定：評価月の全員の一覧 */
function mxRenderJudge_(ss, month) {
  const ctx = mxContext_(ss, month);
  const sheet = mxStartSheet_(ss, MX_SHEET.judge, 'ミクチャ ティア判定',
    '月次CSVから自動判定。担当者・パーソナル枠・イベント・ティア入り月（特例）・本部長承認・デビュー月は「タレントマスタ」で入力します。', ctx);
  if (!ctx.month) return;
  const list = mxJudgeMonth(ctx.idx, ctx.month, ctx.cfg, ctx.masters);
  const counts = MX_TIERS.map(function (t) { return [t, list.filter(function (x) { return x.tier === t; }).length]; });
  sheet.getRange(4, 2, 1, counts.length * 2).setValues([[].concat.apply([], counts)]);
  counts.forEach(function (c, i) { sheet.getRange(4, 2 + i * 2).setBackground(MX_TIER_COLOR[c[0]]).setFontWeight('bold'); });
  const head = ['ユーザーID', '配信者名', '区分', '担当者', '配信回数', '配信時間（h）', '売上（円）', '会社売上（円）', '前月 売上', '前々月 売上',
    '直近3ヶ月 配信h', 'ティア入り月（自動）', 'イベント3回', 'ティア入り月（特例）', 'パーソナル枠', 'ティア', '判定理由', '次のティアまで',
    'デビュー月', '本部長承認', '初月判定', 'メモ'];
  const rows = list.map(function (x) {
    return [x.id, x.name, x.group, x.owner, x.count, Math.round(x.hours * 10) / 10, x.sales, x.company, x.sales1, x.sales2,
      Math.round(x.recent * 10) / 10, x.entry ? mxMonthLabel(x.entry) : '', x.event, x.special, x.personal, x.tier, x.reason, x.next,
      x.debut ? mxMonthLabel(x.debut) : '', x.approve, x.shoki, x.memo];
  });
  mxEnsureRows_(sheet, 7 + rows.length);
  mxHeader_(sheet.getRange(6, 1, 1, head.length).setValues([head]));
  if (rows.length) {
    sheet.getRange(7, 1, rows.length, 4).setNumberFormat('@');
    sheet.getRange(7, 12, rows.length, 10).setNumberFormat('@');
    sheet.getRange(7, 1, rows.length, head.length).setValues(rows);
    sheet.getRange(7, 7, rows.length, 4).setNumberFormat('#,##0');
    const tierRange = sheet.getRange(7, 16, rows.length, 1);
    sheet.setConditionalFormatRules(MX_TIERS.map(function (t) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(MX_TIER_COLOR[t]).setRanges([tierRange]).build();
    }));
    sheet.getRange(6, 1, rows.length + 1, head.length).createFilter();
  }
  sheet.setFrozenRows(6);
  sheet.setFrozenColumns(2);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidths(17, 2, 260);
}

/** タレント分け：ティアごとのメンバー（売上順） */
function mxRenderBoard_(ss, month) {
  const ctx = mxContext_(ss, month);
  const sheet = mxStartSheet_(ss, MX_SHEET.board, 'ミクチャ ティア別メンバー', '「ティア判定」の結果から自動で振り分け（評価月の売上の多い順）。', ctx);
  if (!ctx.month) return;
  const list = mxJudgeMonth(ctx.idx, ctx.month, ctx.cfg, ctx.masters);
  const prev = {};
  if (ctx.idx.ids[mxAddMonths(ctx.month, -1)]) {
    mxJudgeMonth(ctx.idx, mxAddMonths(ctx.month, -1), ctx.cfg, ctx.masters).forEach(function (x) { prev[x.id] = x.tier; });
  }
  const desc = {
    ティア1: '月売上' + ctx.cfg.t1 / 10000 + '万円以上＋本部長承認', ティア1候補: '月売上' + ctx.cfg.t1 / 10000 + '万円以上・承認待ち',
    ティア2: '月売上' + ctx.cfg.t2 / 10000 + '万円以上', ティア3: '初月に' + ctx.cfg.hours + 'h配信＋イベント' + ctx.cfg.events + '回を達成',
    パーソナル枠: 'ティア外の別枠（担当者が指定）', ティア外: 'ティア入り条件が未達',
  };
  const width = 5;
  const groups = MX_TIERS.map(function (t) { return list.filter(function (x) { return x.tier === t && (t !== 'ティア外' || x.sales > 0 || x.hours > 0); }); });
  const maxLen = Math.max(1, Math.max.apply(null, groups.map(function (g) { return g.length; })));
  const grid = [];
  for (let r = 0; r < maxLen + 3; r++) grid.push(new Array(MX_TIERS.length * width).fill(''));
  MX_TIERS.forEach(function (t, g) {
    const c = g * width;
    const all = list.filter(function (x) { return x.tier === t; }).length;
    grid[0][c] = t + '｜' + all + '人' + (t === 'ティア外' && all !== groups[g].length ? '（うち配信・売上あり ' + groups[g].length + '人を表示）' : '');
    grid[1][c] = desc[t];
    grid[2][c] = 'No.'; grid[2][c + 1] = '配信者名'; grid[2][c + 2] = '区分'; grid[2][c + 3] = '売上（円）';
    if (!groups[g].length) grid[3][c + 1] = '該当者なし';
    groups[g].forEach(function (x, i) {
      const p = prev[x.id];
      grid[3 + i][c] = i + 1;
      grid[3 + i][c + 1] = x.name + (p && p !== x.tier ? '（前月 ' + p + '）' : '');
      grid[3 + i][c + 2] = x.group;
      grid[3 + i][c + 3] = Math.round(x.sales);
    });
  });
  mxEnsureRows_(sheet, 5 + grid.length);
  mxEnsureCols_(sheet, grid[0].length);
  sheet.getRange(5, 1, grid.length, grid[0].length).setNumberFormat('@').setValues(grid);
  MX_TIERS.forEach(function (t, g) {
    const c = 1 + g * width;
    sheet.getRange(5, c, 1, 4).merge().setBackground(MX_TIER_COLOR[t]).setFontWeight('bold');
    sheet.getRange(6, c, 1, 4).merge().setFontSize(9).setFontColor('#666666');
    mxHeader_(sheet.getRange(7, c, 1, 4));
    sheet.getRange(8, c + 3, maxLen, 1).setNumberFormat('#,##0');
    sheet.setColumnWidth(c, 36);
    sheet.setColumnWidth(c + 1, 190);
    sheet.setColumnWidth(c + 2, 50);
    sheet.setColumnWidth(c + 3, 80);
    if (g < MX_TIERS.length - 1) sheet.setColumnWidth(c + 4, 14);
  });
}

/** 売上ダッシュボード：大元／ぷち別 */
function mxRenderSales_(ss, month) {
  const ctx = mxContext_(ss, month);
  const sheet = mxStartSheet_(ss, MX_SHEET.sales, 'ミクチャ 売上ダッシュボード（大元／ぷち）',
    '売上＝プロモーター獲得分＋ライバー獲得分（税抜）、会社売上＝プロモーター獲得分。区分は「設定」シートのプロモーター名の対応で決まります。', ctx);
  if (!ctx.month) return;
  const groupsAll = [];
  ctx.idx.months.forEach(function (m) {
    ctx.idx.ids[m].forEach(function (id) {
      const g = ctx.idx.stat[m + '|' + id].group;
      if (groupsAll.indexOf(g) < 0) groupsAll.push(g);
    });
  });
  const sum = function (m, g) {
    const s = { n: 0, live: 0, count: 0, hours: 0, sales: 0, company: 0, liver: 0, videos: 0 };
    (ctx.idx.ids[m] || []).forEach(function (id) {
      const x = ctx.idx.stat[m + '|' + id];
      if (g && x.group !== g) return;
      s.n++;
      if (x.hours > 0 || x.count > 0) s.live++;
      ['count', 'hours', 'sales', 'company', 'liver', 'videos'].forEach(function (k) { s[k] += x[k]; });
    });
    return s;
  };
  const M = ctx.month;
  const P = mxAddMonths(M, -1);
  const cur = sum(M, null);
  const prv = ctx.idx.ids[P] ? sum(P, null) : null;

  // 数字のパネル
  const tiles = [
    ['売上（合計）', cur.sales, prv && prv.sales, '¥#,##0'],
    ['会社売上（プロモーター獲得分）', cur.company, prv && prv.company, '¥#,##0'],
    ['ライバー獲得分', cur.liver, prv && prv.liver, '¥#,##0'],
    ['配信した人数', cur.live, prv && prv.live, '#,##0"人"'],
    ['1人あたり売上（配信者）', cur.live ? cur.sales / cur.live : 0, prv && prv.live ? prv.sales / prv.live : 0, '¥#,##0'],
    ['配信時間', cur.hours, prv && prv.hours, '#,##0"h"'],
  ];
  tiles.forEach(function (t, i) {
    const col = 2 + i * 2;
    sheet.getRange(5, col, 1, 2).merge().setValue(t[0]).setFontSize(9).setFontColor('#666666');
    sheet.getRange(6, col, 1, 2).merge().setValue(t[1]).setNumberFormat(t[3]).setFontSize(18).setFontWeight('bold');
    const d = t[2] ? t[1] / t[2] - 1 : null;
    sheet.getRange(7, col, 1, 2).merge().setValue(d === null ? '前月 —' : '前月比 ' + (d >= 0 ? '+' : '') + Math.round(d * 1000) / 10 + '%')
      .setFontSize(9).setFontColor(d === null ? '#999999' : d >= 0 ? '#1E7B4A' : '#C0392B');
    sheet.getRange(5, col, 3, 2).setBackground('#FCE4EC').setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, '#F8BBD0', SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setRowHeight(6, 36);

  // 区分別
  let r = 10;
  sheet.getRange(r - 1, 2).setValue('区分別　' + mxMonthLabel(M)).setFontWeight('bold');
  const head = ['区分', 'CSVの人数', '配信した人数', '配信回数', '配信時間', '動画投稿', '売上（合計）', '会社売上', 'ライバー獲得分', '1人あたり', '構成比'];
  mxHeader_(sheet.getRange(r, 2, 1, head.length).setValues([head]));
  const gRows = groupsAll.concat(['合計']).map(function (g) {
    const s = sum(M, g === '合計' ? null : g);
    return [g, s.n, s.live, s.count, s.hours, s.videos, s.sales, s.company, s.liver, s.live ? s.sales / s.live : 0, cur.sales ? s.sales / cur.sales : 0];
  });
  sheet.getRange(r + 1, 2, gRows.length, head.length).setValues(gRows);
  sheet.getRange(r + 1, 3, gRows.length, 3).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 6, gRows.length, 1).setNumberFormat('#,##0.0');
  sheet.getRange(r + 1, 7, gRows.length, 1).setNumberFormat('#,##0');
  sheet.getRange(r + 1, 8, gRows.length, 4).setNumberFormat('¥#,##0');
  sheet.getRange(r + 1, 12, gRows.length, 1).setNumberFormat('0.0%');
  sheet.getRange(r + gRows.length, 2, 1, head.length).setFontWeight('bold').setBackground('#FCE4EC');
  mxBorder_(sheet.getRange(r, 2, gRows.length + 1, head.length));
  const gEnd = r + gRows.length;

  // ティア別×区分
  r = gEnd + 3;
  const list = mxJudgeMonth(ctx.idx, M, ctx.cfg, ctx.masters);
  sheet.getRange(r - 1, 2).setValue('ティア別（' + mxMonthLabel(M) + 'を評価月にした判定）').setFontWeight('bold');
  const tHead = ['ティア'].concat(groupsAll, ['合計人数', '目標人数', '売上（合計）']);
  mxHeader_(sheet.getRange(r, 2, 1, tHead.length).setValues([tHead]));
  const tRows = MX_TIERS.map(function (t) {
    const people = list.filter(function (x) { return x.tier === t; });
    return [t].concat(groupsAll.map(function (g) { return people.filter(function (x) { return x.group === g; }).length; }),
      [people.length, ctx.cfg.targets[t] || '', people.reduce(function (a, x) { return a + x.sales; }, 0)]);
  });
  sheet.getRange(r + 1, 2, tRows.length, tHead.length).setValues(tRows);
  sheet.getRange(r + 1, 2 + tHead.length - 1, tRows.length, 1).setNumberFormat('¥#,##0');
  MX_TIERS.forEach(function (t, i) { sheet.getRange(r + 1 + i, 2).setBackground(MX_TIER_COLOR[t]).setFontWeight('bold'); });
  mxBorder_(sheet.getRange(r, 2, tRows.length + 1, tHead.length));
  const tierTop = r;

  // 月別の推移
  r = r + tRows.length + 3;
  sheet.getRange(r - 1, 2).setValue('月別の推移（売上）').setFontWeight('bold');
  const mHead = ['月'].concat(groupsAll, ['合計', '会社売上', '配信した人数', '前月比']);
  mxHeader_(sheet.getRange(r, 2, 1, mHead.length).setValues([mHead]));
  const mRows = ctx.idx.months.map(function (m, i) {
    const t = sum(m, null);
    const p = i > 0 ? sum(ctx.idx.months[i - 1], null).sales : 0;
    return [mxMonthLabel(m) + (m >= ctx.nowYm ? '（途中）' : '')].concat(groupsAll.map(function (g) { return sum(m, g).sales; }),
      [t.sales, t.company, t.live, p ? t.sales / p - 1 : '']);
  });
  sheet.getRange(r + 1, 2, mRows.length, 1).setNumberFormat('@');
  sheet.getRange(r + 1, 2, mRows.length, mHead.length).setValues(mRows);
  sheet.getRange(r + 1, 3, mRows.length, groupsAll.length + 2).setNumberFormat('¥#,##0');
  sheet.getRange(r + 1, 2 + mHead.length - 1, mRows.length, 1).setNumberFormat('+0.0%;-0.0%;0.0%');
  const sel = ctx.idx.months.indexOf(M);
  if (sel >= 0) sheet.getRange(r + 1 + sel, 2, 1, mHead.length).setBackground('#FFF2CC');
  mxBorder_(sheet.getRange(r, 2, mRows.length + 1, mHead.length));
  const monthTop = r;

  // 上位10人
  const top = list.slice().sort(function (a, b) { return b.sales - a.sales; }).slice(0, 10).filter(function (x) { return x.sales > 0; });
  r = r + mRows.length + 3;
  sheet.getRange(r - 1, 2).setValue('売上 上位10人　' + mxMonthLabel(M)).setFontWeight('bold');
  const topHead = ['配信者名', '区分', 'ティア', '売上（合計）', '会社売上', '配信時間', '担当者'];
  mxHeader_(sheet.getRange(r, 2, 1, topHead.length).setValues([topHead]));
  if (top.length) {
    sheet.getRange(r + 1, 2, top.length, 1).setNumberFormat('@');
    sheet.getRange(r + 1, 2, top.length, topHead.length).setValues(top.map(function (x) {
      return [x.name, x.group, x.tier, x.sales, x.company, Math.round(x.hours * 10) / 10, x.owner];
    }));
    sheet.getRange(r + 1, 5, top.length, 2).setNumberFormat('¥#,##0');
    mxBorder_(sheet.getRange(r, 2, top.length + 1, topHead.length));
  }
  const topTop = r;
  sheet.setColumnWidth(1, 16);
  sheet.setColumnWidths(2, 13, 105);
  sheet.setColumnWidth(2, 160);
  sheet.setFrozenRows(3);
  SpreadsheetApp.flush();

  // グラフ（O列から右）
  const col = 15;
  const colors = MX_GROUP_COLOR.slice(0, groupsAll.length);
  sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(monthTop, 2, mRows.length + 1, 1 + groupsAll.length)).setNumHeaders(1).setPosition(4, col, 0, 0)
    .setOption('title', '月別 売上（区分別）').setOption('isStacked', true).setOption('legend', { position: 'top' }).setOption('colors', colors)
    .setOption('vAxis', { format: '¥#,##0' }).setOption('width', 620).setOption('height', 300).build());
  sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange(10, 2, groupsAll.length + 1, 1)).addRange(sheet.getRange(10, 8, groupsAll.length + 1, 1)).setNumHeaders(1)
    .setPosition(20, col, 0, 0).setOption('title', mxMonthLabel(M) + ' 売上の区分構成').setOption('pieHole', 0.5).setOption('colors', colors)
    .setOption('width', 300).setOption('height', 250).build());
  sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(tierTop, 2, MX_TIERS.length + 1, 1)).addRange(sheet.getRange(tierTop, 2 + groupsAll.length + 1, MX_TIERS.length + 1, 1))
    .setNumHeaders(1).setPosition(20, col + 3, 20, 0).setOption('title', 'ティア別 人数').setOption('legend', { position: 'none' })
    .setOption('colors', [MX_HEADER_BG]).setOption('width', 320).setOption('height', 250).build());
  if (top.length) {
    sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange(topTop, 2, top.length + 1, 1)).addRange(sheet.getRange(topTop, 5, top.length + 1, 1)).setNumHeaders(1)
      .setPosition(34, col, 0, 0).setOption('title', '売上 上位10人').setOption('legend', { position: 'none' }).setOption('colors', [MX_HEADER_BG])
      .setOption('hAxis', { format: '¥#,##0' }).setOption('width', 620).setOption('height', 320).build());
  }
}

// ===== アプリ（ウェブアプリの画面） ==========================================

function doGet() {
  // 画面とサーバーで同じ判定をするため、判定の関数をそのまま画面に埋め込む
  const shared = [mxBuildIndex, mxAddMonths, mxMonthLabel, mxParseYm, mxJudge, mxJudgeMonth, mxDefaultMonth]
    .map(function (f) { return f.toString(); }).join('\n') + '\nconst MX_TIERS = ' + JSON.stringify(MX_TIERS) + ';';
  return HtmlService.createHtmlOutput(MX_APP_HTML_.replace('/*__MX_SHARED__*/', shared))
    .setTitle('ミクチャ ティア判定')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 画面から：データ一式 */
function mxWebLoad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  mxEnsureSheets_(ss);
  const logSheet = ss.getSheetByName(MX_SHEET.log);
  const last = logSheet.getLastRow();
  const log = last >= 2
    ? logSheet.getRange(Math.max(2, last - 9), 1, Math.min(10, last - 1), 5).getDisplayValues().reverse()
    : [];
  return {
    rows: mxReadMonthly_(ss).map(function (r) { return r.map(function (v) { return v instanceof Date ? String(v) : v; }); }),
    masters: mxReadMasters_(ss),
    cfg: mxReadConfig_(ss),
    log: log,
    url: ss.getUrl(),
  };
}

/** 画面から：CSV取込 files: [{name, text, month}] */
function mxWebImport(files) {
  return mxImportFiles(files);
}

/** 画面から：タレントマスタの保存 */
function mxWebSaveTalent(id, f) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  mxWithLock_(function () {
    const sheet = ss.getSheetByName(MX_SHEET.master);
    const last = sheet.getLastRow();
    const ids = last >= MX_MASTER_FIRST_ROW
      ? sheet.getRange(MX_MASTER_FIRST_ROW, 1, last - MX_MASTER_FIRST_ROW + 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); })
      : [];
    let row = ids.indexOf(String(id)) + MX_MASTER_FIRST_ROW;
    if (row < MX_MASTER_FIRST_ROW) {
      row = Math.max(last, MX_MASTER_FIRST_ROW - 1) + 1;
      mxEnsureRows_(sheet, row);
      sheet.getRange(row, 1).setNumberFormat('@').setValue(String(id));
    }
    sheet.getRange(row, 3, 1, 7).setNumberFormat('@').setValues([[
      f.owner || '', f.personal || '', f.event || '', f.special || '', f.memo || '', f.approve || '', f.debut || '',
    ]]);
    mxRefreshAll_(ss);
  });
  return true;
}

/** 画面から：判定基準の保存 */
function mxWebSaveConfig(c) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  mxWithLock_(function () {
    ss.getSheetByName(MX_SHEET.settings).getRange('B4:B8').setValues([[mxNum_(c.hours)], [mxNum_(c.events)], [mxNum_(c.t2)], [mxNum_(c.t1)], [mxNum_(c.start)]]);
    mxRefreshAll_(ss);
  });
  return true;
}

// ===== 小物 ================================================================

function mxNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v == null ? '' : v).replace(/[¥￥,，円\s]/g, ''));
  return isFinite(n) ? n : 0;
}

function mxYm_(d) {
  return d.getFullYear() * 100 + d.getMonth() + 1;
}

function mxMonthLabel_(ym) {
  return mxMonthLabel(ym);
}

function mxParseMonthLabel_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return mxYm_(v);
  const m = String(v == null ? '' : v).match(/(\d{4})\D+(\d{1,2})/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

function mxHeader_(range) {
  return range.setBackground(MX_HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
}

function mxBorder_(range) {
  range.setBorder(true, true, true, true, true, true, '#D9D9D9', SpreadsheetApp.BorderStyle.SOLID);
}

function mxEnsureRows_(sheet, n) {
  if (sheet.getMaxRows() < n) sheet.insertRowsAfter(sheet.getMaxRows(), n - sheet.getMaxRows());
}

function mxEnsureCols_(sheet, n) {
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
}

function mxWithLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5 * 60 * 1000)) throw new Error('別の処理が実行中です。しばらくしてから再実行してください');
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

// ===== CSVアップロードのダイアログ（スプレッドシートのメニューから） ============

const MX_UPLOAD_HTML_ = [
  '<style>body{font-family:sans-serif;font-size:13px;margin:0;padding:4px 8px}table{border-collapse:collapse;width:100%;margin-top:8px}',
  'td{padding:4px;border-bottom:1px solid #eee}button{margin-top:12px;padding:6px 16px}#log{margin-top:10px;white-space:pre-wrap}.err{color:#c00}</style>',
  '<div>ミクチャ管理画面の月次CSVを選んでください（大元・ぷちを一緒に選んでOK）。対象月を確認して「取り込む」を押します。</div>',
  '<input type="file" id="f" accept=".csv" multiple style="margin-top:8px"><table id="t"></table><button id="go" disabled>取り込む</button><div id="log"></div>',
  '<script>',
  'var items=[];',
  'function guess(name){var m=name.match(/(20\\d{2})[-_年\\/]?(\\d{1,2})/);if(m)return m[1]+"-"+("0"+m[2]).slice(-2);',
  ' var d=new Date();var k=name.match(/(\\d{1,2})月/);if(k){var mon=+k[1];var y=d.getFullYear()-(mon>d.getMonth()+1?1:0);return y+"-"+("0"+mon).slice(-2);}',
  ' return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2);}',
  'function decode(b){try{return new TextDecoder("utf-8",{fatal:true}).decode(b);}catch(e){return new TextDecoder("shift_jis").decode(b);}}',
  'document.getElementById("f").onchange=function(e){items=[];var t=document.getElementById("t");t.innerHTML="";var fs=[].slice.call(e.target.files);var left=fs.length;',
  ' fs.forEach(function(file,i){var tr=document.createElement("tr");tr.innerHTML="<td>"+file.name.replace(/</g,"&lt;")+"</td><td>対象月 <input type=month id=m"+i+"></td>";t.appendChild(tr);',
  '  document.getElementById("m"+i).value=guess(file.name);var r=new FileReader();r.onload=function(){items[i]={name:file.name,text:decode(r.result)};if(--left===0)document.getElementById("go").disabled=false;};r.readAsArrayBuffer(file);});};',
  'document.getElementById("go").onclick=function(){var p=items.map(function(it,i){return{name:it.name,text:it.text,month:document.getElementById("m"+i).value.replace("-","")};});',
  ' this.disabled=true;var log=document.getElementById("log");log.textContent="取込中…（30秒ほどかかることがあります）";',
  ' google.script.run.withSuccessHandler(function(m){log.textContent=m.join("\\n")+"\\n\\n完了しました。閉じてOKです。";}).withFailureHandler(function(e){log.innerHTML="<span class=err>"+String(e.message||e).replace(/</g,"&lt;")+"</span>";}).mxImportFiles(p);};',
  '</script>',
].join('\n');

// ===== アプリの画面（自動生成：mixch-tier/webapp/App.html を node mixch-tier/build.js で埋め込む） =====
// <APP_HTML>
const MX_APP_HTML_ = [
  "<title>ミクチャ ティア判定</title>",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Zen+Kaku+Gothic+New:wght@700;900&family=Roboto+Mono:wght@500&display=swap\">",
  "<style>",
  "/* ミクチャ版（REALITY版と同じ骨組み）。Layout: 月タブ → ティア人数の帯 → 絞り込み → T1〜未評価の6列ボード（狭い画面では縦積み）。人を押すと右から詳細パネル */",
  ":root {",
  "  --bg: #f3f5f9;",
  "  --surface: #ffffff;",
  "  --surface-2: #eef1f7;",
  "  --fg: #172033;",
  "  --muted: #5d6880;",
  "  --line: #dde2ec;",
  "  --accent: #c2185b;",
  "  --accent-fg: #ffffff;",
  "  --accent-soft: #fce4ec;",
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
  "    --accent: #f48fb1; --accent-fg: #11151f; --accent-soft: #4a1f33; --up: #52c999; --down: #ff8080;",
  "    --warn-bg: #3a2f14; --warn-fg: #f3d58a;",
  "    --t1-bg: #3a3112; --t1-fg: #f6dc85; --t2-bg: #163527; --t2-fg: #8fdcb5; --t3-bg: #172c48; --t3-fg: #9cc6f6;",
  "    --t4-bg: #2c2042; --t4-fg: #ccb2f2; --t5-bg: #252b38; --t5-fg: #b6bdcc; --tu-bg: #1d2331; --tu-fg: #9aa5bd;",
  "    --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 4px 16px rgba(0, 0, 0, .25);",
  "    color-scheme: dark;",
  "  }",
  "}",
  ":root[data-theme=\"dark\"] {",
  "  --bg: #11151f; --surface: #1a2030; --surface-2: #222a3d; --fg: #e7ebf3; --muted: #9aa5bd; --line: #2e3850;",
  "  --accent: #f48fb1; --accent-fg: #11151f; --accent-soft: #4a1f33; --up: #52c999; --down: #ff8080;",
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
  "",
  ".views { display: flex; gap: 6px; }",
  ".view-btn { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 7px 16px; font-weight: 700; font-size: 13px; }",
  ".view-btn[aria-selected=\"true\"] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }",
  ".target { font-size: 11px; color: var(--muted); }",
  ".table-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: grid; gap: 10px; min-width: 0; }",
  ".table-card h3 { font-size: 14px; }",
  ".data { width: 100%; border-collapse: collapse; font-size: 13px; }",
  ".data th, .data td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }",
  ".data th:first-child, .data td:first-child { text-align: left; }",
  ".data th { font-size: 11px; color: var(--muted); font-weight: 700; }",
  ".data tr.total td { font-weight: 700; background: var(--surface-2); }",
  ".data tr.sel td { background: var(--accent-soft); }",
  ".bar { display: inline-block; height: 8px; border-radius: 4px; background: var(--accent); vertical-align: middle; margin-right: 6px; }",
  ".grid2col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }",
  "@media (max-width: 900px) { .grid2col { grid-template-columns: minmax(0, 1fr); } }",
  ".form select { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 8px 10px; font-size: 13px; width: 100%; }",
  ".loading { color: var(--muted); padding: 24px 0; }",
  ".filters label.meta { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }",
  ".filters label.meta input { width: auto; margin: 0; }",
  "</style>",
  "",
  "<div class=\"wrap\">",
  "  <header class=\"top\">",
  "    <div class=\"title\">",
  "      <h1>ライバーTier判定 <small>ミクチャ</small></h1>",
  "      <p>ミクチャの月次CSV（大元・ぷち）を取り込むと、各月を評価月としてティア1〜3を自動判定します。売上は大元／ぷち別に確認できます。</p>",
  "    </div>",
  "    <div class=\"actions\">",
  "      <div class=\"views\" role=\"tablist\" aria-label=\"表示\">",
  "        <button class=\"view-btn\" id=\"v-tier\" type=\"button\" aria-selected=\"true\">ティア</button>",
  "        <button class=\"view-btn\" id=\"v-sales\" type=\"button\" aria-selected=\"false\">売上</button>",
  "      </div>",
  "      <button class=\"btn\" id=\"btn-criteria\" type=\"button\">判定基準</button>",
  "      <button class=\"btn\" id=\"btn-export\" type=\"button\" disabled>この月をCSV書き出し</button>",
  "      <button class=\"btn primary\" id=\"btn-import\" type=\"button\">CSVを取り込む</button>",
  "    </div>",
  "  </header>",
  "",
  "  <div class=\"notice\" id=\"notice\" hidden></div>",
  "  <nav class=\"tabs\" id=\"tabs\" aria-label=\"評価月\"></nav>",
  "",
  "  <main id=\"main\">",
  "    <section class=\"empty\" id=\"empty\">",
  "      <h2 id=\"empty-title\">データを読み込んでいます…</h2>",
  "      <p id=\"empty-text\">取り込んだ月がタブとして並び、選んだ月のティア別メンバーと売上が表示されます。</p>",
  "    </section>",
  "",
  "    <div id=\"tier-view\" hidden style=\"display:grid;gap:14px\">",
  "      <section class=\"strip\" id=\"strip\" aria-label=\"ティア別の人数\"></section>",
  "      <div class=\"moves\" id=\"moves\"></div>",
  "      <div class=\"filters\">",
  "        <input id=\"q\" type=\"search\" placeholder=\"配信者名・IDで探す\" aria-label=\"配信者名・IDで探す\">",
  "        <select id=\"f-group\" aria-label=\"区分\"><option value=\"\">区分：すべて</option></select>",
  "        <select id=\"f-owner\" aria-label=\"担当者\"><option value=\"\">担当者：すべて</option></select>",
  "        <label class=\"meta\"><input id=\"f-active\" type=\"checkbox\" checked> ティア外は配信・売上がある人だけ</label>",
  "        <span class=\"spacer\"></span>",
  "        <span class=\"meta\" id=\"meta\"></span>",
  "      </div>",
  "      <section class=\"board\" id=\"board\" aria-label=\"ティア別メンバー\"></section>",
  "    </div>",
  "",
  "    <div id=\"sales-view\" hidden style=\"display:grid;gap:14px\">",
  "      <section class=\"strip\" id=\"sales-strip\" aria-label=\"売上の合計\" style=\"grid-template-columns:repeat(6,minmax(0,1fr))\"></section>",
  "      <div class=\"grid2col\">",
  "        <section class=\"table-card\"><h3 id=\"g-title\">区分別</h3><div class=\"table-scroll\" id=\"g-table\"></div></section>",
  "        <section class=\"table-card\"><h3>ティア別</h3><div class=\"table-scroll\" id=\"t-table\"></div></section>",
  "      </div>",
  "      <section class=\"table-card\"><h3>月別の推移（売上）</h3><div class=\"table-scroll\" id=\"m-table\"></div></section>",
  "      <section class=\"table-card\"><h3 id=\"top-title\">売上 上位10人</h3><div class=\"table-scroll\" id=\"top-table\"></div></section>",
  "    </div>",
  "  </main>",
  "",
  "  <footer class=\"footer\">",
  "    <p id=\"criteria-line\"></p>",
  "    <p>売上＝プロモーター獲得分＋ライバー獲得分（税抜）。会社売上＝プロモーター獲得分。前月＝前月を評価月にしたときのティア。<span id=\"last-import\"></span>　<a id=\"sheet-link\" href=\"#\" target=\"_blank\" rel=\"noopener\" hidden>スプレッドシートを開く</a></p>",
  "  </footer>",
  "</div>",
  "",
  "<div class=\"scrim\" id=\"scrim\" hidden></div>",
  "<aside class=\"drawer\" id=\"drawer\" hidden aria-label=\"配信者の詳細\"></aside>",
  "",
  "<div class=\"modal\" id=\"import-modal\" hidden>",
  "  <div class=\"dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"imp-title\">",
  "    <h2 id=\"imp-title\">CSVを取り込む</h2>",
  "    <p>ミクチャ管理画面の月次CSVを選んでください（大元・ぷちを一緒に選んでOK・UTF-8／Shift_JIS）。区分は「所属プロモーター名」から自動で決まります。同じ月・同じ区分は、新しいCSVでまるごと置き換えます。</p>",
  "    <label class=\"drop\" id=\"drop\">",
  "      <span>ここにCSVをドロップ</span>",
  "      <span class=\"btn\">ファイルを選ぶ</span>",
  "      <input id=\"file\" type=\"file\" accept=\".csv,text/csv\" multiple hidden>",
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
  "    <p>ティア入り済みの人を月売上でティア1／2／3に分けます。ティア入り前は、パーソナル枠（○）かティア外です。変更するとスプレッドシートの設定シートにも保存されます。</p>",
  "    <form class=\"form\" id=\"criteria-form\">",
  "      <div class=\"grid2\">",
  "        <label>ティア入り：月の配信時間（h）<input id=\"c-hours\" type=\"number\" min=\"0\" step=\"1\" required></label>",
  "        <label>ティア入り：月のイベント参加（回）<input id=\"c-events\" type=\"number\" min=\"0\" step=\"1\" required></label>",
  "        <label>ティア2：月売上（円）<input id=\"c-t2\" type=\"number\" min=\"0\" step=\"10000\" required></label>",
  "        <label>ティア1：月売上（円）<input id=\"c-t1\" type=\"number\" min=\"0\" step=\"10000\" required></label>",
  "        <label>初月ルールの開始月（yyyymm）<input id=\"c-start\" type=\"number\" min=\"200001\" step=\"1\" required></label>",
  "      </div>",
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
  "  /*__MX_SHARED__*/",
  "",
  "  const TIER_CLASS = { ティア1: 'tier-T1', ティア1候補: 'tier-T4', ティア2: 'tier-T2', ティア3: 'tier-T3', パーソナル枠: 'tier-T5', ティア外: 'tier-U' };",
  "  const state = { rows: [], masters: {}, cfg: null, idx: null, sel: null, list: [], prevMap: {}, hasPrev: false, view: 'tier', open: null, pending: [], loaded: false };",
  "  try { const t = localStorage.getItem('mx-month'); if (t) state.sel = Number(t); const v = localStorage.getItem('mx-view'); if (v) state.view = v; } catch (e) {}",
  "",
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
  "  const fmtH = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);",
  "  const nowYm = () => { const d = new Date(); return d.getFullYear() * 100 + d.getMonth() + 1; };",
  "  const showNotice = (msg) => { $('notice').textContent = msg || ''; $('notice').hidden = !msg; };",
  "  const errText = (e) => (e && e.message) || String(e);",
  "  const gs = (fn, ...args) => new Promise((ok, ng) => google.script.run.withSuccessHandler(ok).withFailureHandler(ng)[fn](...args));",
  "",
  "  // ===== 描画 =====",
  "  function render() {",
  "    state.idx = mxBuildIndex(state.rows);",
  "    const months = state.idx.months;",
  "    const c = state.cfg || { hours: 60, events: 3, t2: 250000, t1: 500000, start: 202610 };",
  "    $('criteria-line').textContent = '判定基準：ティア入り＝' + (c.start % 100) + '月以降デビューはデビュー月に' + c.hours + 'h配信＋イベント' + c.events +",
  "      '回（既存はどの月でも' + c.hours + 'h）、ティア2＝月売上' + c.t2 / 10000 + '万、ティア1＝' + c.t1 / 10000 + '万＋本部長承認';",
  "    $('v-tier').setAttribute('aria-selected', String(state.view === 'tier'));",
  "    $('v-sales').setAttribute('aria-selected', String(state.view === 'sales'));",
  "    if (!months.length) {",
  "      $('tier-view').hidden = true; $('sales-view').hidden = true; $('empty').hidden = false; $('tabs').replaceChildren();",
  "      $('btn-export').disabled = true;",
  "      $('empty-title').textContent = state.loaded ? 'まだ月次データがありません' : 'データを読み込んでいます…';",
  "      $('empty-text').textContent = state.loaded ? '右上の「CSVを取り込む」から、ミクチャの月次CSV（大元・ぷち）を入れてください。' : '取り込んだ月がタブとして並びます。';",
  "      return;",
  "    }",
  "    if (!state.sel || !state.idx.ids[state.sel]) state.sel = mxDefaultMonth(state.idx, c, nowYm());",
  "    const M = state.sel;",
  "    state.list = mxJudgeMonth(state.idx, M, c, state.masters);",
  "    const P = mxAddMonths(M, -1);",
  "    state.hasPrev = !!state.idx.ids[P];",
  "    state.prevMap = {};",
  "    if (state.hasPrev) mxJudgeMonth(state.idx, P, c, state.masters).forEach((x) => (state.prevMap[x.id] = x.tier));",
  "    state.list.forEach((x) => {",
  "      const p = state.prevMap[x.id] || '';",
  "      x.prevTier = p;",
  "      x.change = !state.hasPrev ? '' : !p ? '新規' : MX_TIERS.indexOf(x.tier) < MX_TIERS.indexOf(p) ? '昇格' : MX_TIERS.indexOf(x.tier) > MX_TIERS.indexOf(p) ? '降格' : '維持';",
  "    });",
  "    $('empty').hidden = true;",
  "    $('btn-export').disabled = false;",
  "    renderTabs(months);",
  "    $('tier-view').hidden = state.view !== 'tier';",
  "    $('sales-view').hidden = state.view !== 'sales';",
  "    if (state.view === 'tier') { renderStrip(); renderFilters(); renderBoard(); } else renderSales();",
  "    if (state.open) renderDrawer();",
  "  }",
  "",
  "  function renderTabs(months) {",
  "    const now = nowYm();",
  "    $('tabs').replaceChildren(...months.slice().reverse().map((m) => el('button', {",
  "      class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(m === state.sel),",
  "      onclick: () => { state.sel = m; try { localStorage.setItem('mx-month', String(m)); } catch (e) {} render(); },",
  "    }, [mxMonthLabel(m), m >= now ? el('span', { class: 'partial', text: '途中' }) : null])));",
  "  }",
  "",
  "  function renderStrip() {",
  "    const count = {}, prevCount = {};",
  "    state.list.forEach((x) => (count[x.tier] = (count[x.tier] || 0) + 1));",
  "    Object.values(state.prevMap).forEach((t) => (prevCount[t] = (prevCount[t] || 0) + 1));",
  "    const targets = (state.cfg && state.cfg.targets) || {};",
  "    const cells = MX_TIERS.map((t) => {",
  "      const n = count[t] || 0;",
  "      const d = n - (prevCount[t] || 0);",
  "      return el('div', { class: 'cell ' + TIER_CLASS[t] }, [",
  "        el('span', { class: 'lbl' }, [el('span', { class: 'dot', style: 'background:var(--c)' }), t]),",
  "        el('span', { class: 'val' }, [String(n), el('small', { text: '人' })]),",
  "        el('span', { class: 'delta' }, state.hasPrev ? ['前月 ' + (prevCount[t] || 0) + '人 ', el('span', { class: d > 0 ? 'up' : d < 0 ? 'down' : '', text: d === 0 ? '±0' : (d > 0 ? '+' : '') + d })] : ['前月 —']),",
  "        targets[t] ? el('span', { class: 'target', text: '目標 ' + targets[t] + '人' + (n >= targets[t] ? '（達成）' : '（あと' + (targets[t] - n) + '人）') }) : null,",
  "      ]);",
  "    });",
  "    cells.push(el('div', { class: 'cell' }, [el('span', { class: 'lbl', text: 'CSVの人数' }), el('span', { class: 'val' }, [String(state.list.length), el('small', { text: '人' })])]));",
  "    $('strip').replaceChildren(...cells);",
  "    const mv = { 昇格: 0, 降格: 0 };",
  "    state.list.forEach((x) => { if (x.change in mv) mv[x.change]++; });",
  "    const M = state.sel;",
  "    $('moves').replaceChildren(el('span', {}, ['評価月 ', el('b', { text: mxMonthLabel(M) }), M >= nowYm() ? '（途中経過）' : '']),",
  "      ...(state.hasPrev ? [el('span', {}, ['前月から 昇格 ', el('b', { text: mv['昇格'] + '人' })]), el('span', {}, ['降格 ', el('b', { text: mv['降格'] + '人' })])] : []));",
  "  }",
  "",
  "  function renderFilters() {",
  "    const fill = (sel, label, values) => {",
  "      const cur = sel.value;",
  "      sel.replaceChildren(el('option', { value: '', text: label + '：すべて' }), ...values.map((v) => el('option', { value: v, text: v })));",
  "      sel.value = values.indexOf(cur) >= 0 ? cur : '';",
  "    };",
  "    fill($('f-group'), '区分', Array.from(new Set(state.list.map((x) => x.group).filter(Boolean))));",
  "    fill($('f-owner'), '担当者', Array.from(new Set(Object.values(state.masters).map((m) => m.owner).filter(Boolean))).sort());",
  "  }",
  "",
  "  function renderBoard() {",
  "    const q = $('q').value.trim().toLowerCase(), g = $('f-group').value, o = $('f-owner').value, active = $('f-active').checked;",
  "    const list = state.list.filter((x) => (!q || x.name.toLowerCase().includes(q) || x.id.includes(q)) && (!g || x.group === g) && (!o || x.owner === o));",
  "    $('meta').textContent = list.length + '人 / ' + state.list.length + '人';",
  "    const c = state.cfg;",
  "    const desc = { ティア1: '月売上' + c.t1 / 10000 + '万以上＋本部長承認', ティア1候補: '月売上' + c.t1 / 10000 + '万以上・承認待ち（25日報告）',",
  "      ティア2: '月売上' + c.t2 / 10000 + '万以上', ティア3: '初月に' + c.hours + 'h配信＋イベント' + c.events + '回を達成',",
  "      パーソナル枠: 'ティア外の別枠（担当者が指定）', ティア外: 'ティア入り条件が未達' };",
  "    $('board').replaceChildren(...MX_TIERS.map((t) => {",
  "      let people = list.filter((x) => x.tier === t);",
  "      const all = people.length;",
  "      if (t === 'ティア外' && active) people = people.filter((x) => x.sales > 0 || x.hours > 0);",
  "      return el('section', { class: 'col ' + TIER_CLASS[t] }, [",
  "        el('div', { class: 'col-head' }, [el('h2', { text: t }), el('span', { class: 'count', text: all + '人' })]),",
  "        el('div', { class: 'col-desc', text: desc[t] + (people.length !== all ? '（表示 ' + people.length + '人）' : '') }),",
  "        people.length ? el('ul', { class: 'list' }, people.slice(0, 400).map((x, i) => el('li', {}, [el('button', { class: 'person', type: 'button', onclick: () => { state.open = x.id; renderDrawer(); } }, [",
  "          el('span', { class: 'no', text: String(i + 1) }),",
  "          el('span', { class: 'nm', text: x.name, title: x.name }),",
  "          el('span', { class: 'sales', text: '¥' + yen(x.sales) + '・' + fmtH(x.hours) + 'h・' + x.group + (x.owner ? '・' + x.owner : '') }),",
  "          x.change === '昇格' ? el('span', { class: 'chip up', text: x.prevTier + '→' }) : x.change === '降格' ? el('span', { class: 'chip down', text: x.prevTier + '→' }) : x.change === '新規' ? el('span', { class: 'chip new', text: '新規' }) : el('span'),",
  "        ])]))) : el('div', { class: 'empty-col', text: '該当者なし' }),",
  "      ]);",
  "    }));",
  "  }",
  "",
  "  // ===== 売上 =====",
  "  function sumOf(m, g) {",
  "    const s = { n: 0, live: 0, count: 0, hours: 0, sales: 0, company: 0, liver: 0, videos: 0 };",
  "    (state.idx.ids[m] || []).forEach((id) => {",
  "      const x = state.idx.stat[m + '|' + id];",
  "      if (g && x.group !== g) return;",
  "      s.n++; if (x.hours > 0 || x.count > 0) s.live++;",
  "      ['count', 'hours', 'sales', 'company', 'liver', 'videos'].forEach((k) => (s[k] += x[k]));",
  "    });",
  "    return s;",
  "  }",
  "  function table(head, rows, opts) {",
  "    return el('table', { class: 'data' }, [el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]),",
  "      el('tbody', {}, rows.map((r, i) => el('tr', { class: (opts && opts.rowClass && opts.rowClass(r, i)) || '' }, r.map((v) => (v instanceof Node ? el('td', {}, [v]) : el('td', { text: v }))))))]);",
  "  }",
  "  function renderSales() {",
  "    const M = state.sel, P = mxAddMonths(M, -1);",
  "    const groups = [];",
  "    state.idx.months.forEach((m) => state.idx.ids[m].forEach((id) => { const g = state.idx.stat[m + '|' + id].group; if (groups.indexOf(g) < 0) groups.push(g); }));",
  "    const cur = sumOf(M), prv = state.idx.ids[P] ? sumOf(P) : null;",
  "    const tiles = [['売上（合計）', cur.sales, prv && prv.sales, '¥'], ['会社売上', cur.company, prv && prv.company, '¥'], ['ライバー獲得分', cur.liver, prv && prv.liver, '¥'],",
  "      ['配信した人数', cur.live, prv && prv.live, '人'], ['1人あたり売上', cur.live ? cur.sales / cur.live : 0, prv && prv.live ? prv.sales / prv.live : 0, '¥'], ['配信時間', cur.hours, prv && prv.hours, 'h']];",
  "    $('sales-strip').replaceChildren(...tiles.map(([label, v, p, unit]) => {",
  "      const d = p ? v / p - 1 : null;",
  "      return el('div', { class: 'cell' }, [el('span', { class: 'lbl', text: label }),",
  "        el('span', { class: 'val' }, unit === '¥' ? ['¥' + yen(v)] : [yen(v), el('small', { text: unit })]),",
  "        el('span', { class: 'delta' }, d === null ? ['前月 —'] : ['前月比 ', el('span', { class: d >= 0 ? 'up' : 'down', text: (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + '%' })])]);",
  "    }));",
  "    $('g-title').textContent = '区分別　' + mxMonthLabel(M);",
  "    $('g-table').replaceChildren(table(['区分', 'CSV人数', '配信した人数', '配信時間', '売上', '会社売上', '1人あたり', '構成比'],",
  "      groups.concat(['合計']).map((g) => { const s = sumOf(M, g === '合計' ? null : g); return [g, yen(s.n), yen(s.live), fmtH(s.hours) + 'h', '¥' + yen(s.sales), '¥' + yen(s.company), '¥' + yen(s.live ? s.sales / s.live : 0), cur.sales ? (s.sales / cur.sales * 100).toFixed(1) + '%' : '—']; }),",
  "      { rowClass: (r) => (r[0] === '合計' ? 'total' : '') }));",
  "    const targets = (state.cfg && state.cfg.targets) || {};",
  "    $('t-table').replaceChildren(table(['ティア'].concat(groups, ['合計', '目標', '売上']), MX_TIERS.map((t) => {",
  "      const ppl = state.list.filter((x) => x.tier === t);",
  "      return [el('span', { class: 'badge ' + TIER_CLASS[t], text: t })].concat(groups.map((g) => String(ppl.filter((x) => x.group === g).length)), [String(ppl.length), targets[t] ? String(targets[t]) : '—', '¥' + yen(ppl.reduce((a, x) => a + x.sales, 0))]);",
  "    })));",
  "    const max = Math.max(1, ...state.idx.months.map((m) => sumOf(m).sales));",
  "    $('m-table').replaceChildren(table(['月'].concat(groups, ['合計', '会社売上', '配信した人数', '前月比']), state.idx.months.map((m, i) => {",
  "      const t = sumOf(m), p = i > 0 ? sumOf(state.idx.months[i - 1]).sales : 0;",
  "      return [mxMonthLabel(m) + (m >= nowYm() ? '（途中）' : '')].concat(groups.map((g) => '¥' + yen(sumOf(m, g).sales)),",
  "        [el('span', {}, [el('span', { class: 'bar', style: 'width:' + Math.round((t.sales / max) * 120) + 'px' }), '¥' + yen(t.sales)]), '¥' + yen(t.company), yen(t.live), p ? ((t.sales / p - 1) * 100).toFixed(1) + '%' : '—']);",
  "    }), { rowClass: (r, i) => (state.idx.months[i] === M ? 'sel' : '') }));",
  "    $('top-title').textContent = '売上 上位10人　' + mxMonthLabel(M);",
  "    $('top-table').replaceChildren(table(['配信者名', '区分', 'ティア', '売上', '会社売上', '配信時間', '担当者'],",
  "      state.list.slice().sort((a, b) => b.sales - a.sales).slice(0, 10).filter((x) => x.sales > 0).map((x) => [x.name, x.group, x.tier, '¥' + yen(x.sales), '¥' + yen(x.company), fmtH(x.hours) + 'h', x.owner || '—'])));",
  "  }",
  "",
  "  // ===== 詳細 =====",
  "  function closeDrawer() { state.open = null; $('drawer').hidden = true; $('scrim').hidden = true; }",
  "  function renderDrawer() {",
  "    const x = state.list.find((p) => p.id === state.open);",
  "    if (!x) { closeDrawer(); return; }",
  "    const m = state.masters[x.id] || {};",
  "    const kv = (k, v) => el('div', {}, [el('dt', { text: k }), el('dd', { text: v })]);",
  "    const sel = (id, opts, v) => { const s = el('select', { id }, opts.map((o) => el('option', { value: o, text: o || '（空欄）' }))); s.value = v || ''; return s; };",
  "    const f = {",
  "      owner: el('input', { id: 'd-owner', value: m.owner || '' }), personal: sel('d-personal', ['', '○'], m.personal), event: sel('d-event', ['', '○', '×'], m.event),",
  "      special: el('input', { id: 'd-special', value: m.special || '', placeholder: '例：2026/08' }), approve: sel('d-approve', ['', '○'], m.approve),",
  "      debut: el('input', { id: 'd-debut', value: m.debut || '', placeholder: '例：2026/10（空欄なら初めて配信した月）' }), memo: el('textarea', { id: 'd-memo' }),",
  "    };",
  "    f.memo.value = m.memo || '';",
  "    const msg = el('span', { class: 'saved' });",
  "    const save = el('button', { class: 'btn primary', type: 'submit', text: '保存' });",
  "    const history = state.idx.months.filter((mm) => state.idx.ids[mm].indexOf(x.id) >= 0).reverse()",
  "      .map((mm) => ({ mm, j: mxJudge(state.idx, x.id, mm, state.cfg, state.masters[x.id]) }));",
  "    const d = $('drawer');",
  "    d.className = 'drawer ' + TIER_CLASS[x.tier];",
  "    d.replaceChildren(",
  "      el('div', { class: 'drawer-head' }, [",
  "        el('div', { class: 'row' }, [el('h2', { text: x.name }), el('button', { class: 'x', type: 'button', 'aria-label': '閉じる', onclick: closeDrawer, text: '×' })]),",
  "        el('div', { class: 'sub' }, [el('span', { class: 'badge', text: x.tier }), '　' + mxMonthLabel(state.sel) + '評価' + (x.prevTier ? '・前月 ' + x.prevTier : '') + '・' + x.group + '　ID ' + x.id]),",
  "      ]),",
  "      el('div', { class: 'drawer-body' }, [",
  "        el('div', { class: 'reason' }, [el('b', { text: '判定理由' }), x.reason, el('b', { text: '次の目標' }), x.next]),",
  "        el('dl', { class: 'kv' }, [kv('配信時間', fmtH(x.hours) + 'h'), kv('配信回数', yen(x.count) + '回'), kv('売上', '¥' + yen(x.sales)), kv('会社売上', '¥' + yen(x.company)),",
  "          kv('前月 売上', '¥' + yen(x.sales1)), kv('前々月 売上', '¥' + yen(x.sales2)), kv('直近3ヶ月 配信', fmtH(x.recent) + 'h'), kv('動画投稿', yen(x.videos) + '回'),",
  "          kv('デビュー月', x.debut ? mxMonthLabel(x.debut) : '—'), kv('ティア入り月', x.special || (x.entry ? mxMonthLabel(x.entry) : '—')), kv('初月判定', x.shoki || '—'), kv('担当者', x.owner || '—')]),",
  "        el('div', { class: 'section-title', text: '月ごとのティア' }),",
  "        el('div', { class: 'table-scroll' }, [el('table', { class: 'hist' }, [el('thead', {}, [el('tr', {}, ['月', 'ティア', '配信時間', '売上'].map((h) => el('th', { text: h })))]),",
  "          el('tbody', {}, history.map(({ mm, j }) => el('tr', { class: mm === state.sel ? 'sel' : '' }, [el('td', { text: mxMonthLabel(mm) }), el('td', {}, [el('span', { class: 'badge ' + TIER_CLASS[j.tier], text: j.tier })]), el('td', { text: fmtH(j.hours) + 'h' }), el('td', { text: '¥' + yen(j.sales) })])))])]),",
  "        el('div', { class: 'section-title', text: 'タレントマスタ（スプレッドシートに保存）' }),",
  "        el('form', { class: 'form', onsubmit: async (e) => {",
  "          e.preventDefault();",
  "          save.disabled = true; msg.style.color = ''; msg.textContent = '保存中…';",
  "          const body = { owner: f.owner.value.trim(), personal: f.personal.value, event: f.event.value, special: f.special.value.trim(), approve: f.approve.value, debut: f.debut.value.trim(), memo: f.memo.value };",
  "          try { await gs('mxWebSaveTalent', x.id, body); state.masters[x.id] = Object.assign({ name: x.name }, body); msg.textContent = '保存しました'; render(); }",
  "          catch (err) { msg.style.color = 'var(--down)'; msg.textContent = '保存できませんでした：' + errText(err); }",
  "          finally { save.disabled = false; }",
  "        } }, [",
  "          el('label', {}, ['担当者', f.owner]),",
  "          el('div', { class: 'grid2' }, [el('label', {}, ['パーソナル枠', f.personal]), el('label', {}, ['イベント3回（ティア入り月）', f.event]),",
  "            el('label', {}, ['ティア入り月（特例・既存）', f.special]), el('label', {}, ['本部長承認（ティア1）', f.approve])]),",
  "          el('label', {}, ['デビュー月', f.debut]),",
  "          el('label', {}, ['メモ', f.memo]),",
  "          el('div', { class: 'dialog-actions' }, [msg, save]),",
  "        ]),",
  "      ]),",
  "    );",
  "    d.hidden = false;",
  "    $('scrim').hidden = false;",
  "  }",
  "",
  "  // ===== 取込 =====",
  "  function decode(buf) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('shift_jis').decode(buf); } }",
  "  function guessMonth(name) {",
  "    let m = name.match(/(20\\d{2})[-_年\\/]?(\\d{1,2})/);",
  "    if (m) return Number(m[1]) * 100 + Number(m[2]);",
  "    m = name.match(/(\\d{1,2})月/);",
  "    const now = nowYm();",
  "    if (m) return mxParseYm(m[1], now);",
  "    return now;",
  "  }",
  "  function peek(text) {",
  "    const lines = text.replace(/^\\uFEFF/, '').split(/\\r?\\n/).filter((l) => l.trim());",
  "    const head = (lines[0] || '').split(',');",
  "    const ip = head.findIndex((h) => h.trim() === '所属プロモーター名');",
  "    if (head.findIndex((h) => h.trim() === 'ユーザーID') < 0) throw new Error('「ユーザーID」の列がありません。ミクチャ管理画面の月次CSVか確認してください');",
  "    const promoters = {};",
  "    lines.slice(1).forEach((l) => { const c = l.split(','); if (c[0] && c[0] !== 'ユーザーID') promoters[(c[ip] || '').trim()] = (promoters[(c[ip] || '').trim()] || 0) + 1; });",
  "    return Object.keys(promoters).map((p) => p + ' ' + promoters[p] + '人').join('／');",
  "  }",
  "  async function addFiles(files) {",
  "    for (const file of files) {",
  "      const it = { name: file.name, text: '', month: guessMonth(file.name), info: '', error: '', status: '' };",
  "      try { it.text = decode(await file.arrayBuffer()); it.info = peek(it.text); } catch (e) { it.error = errText(e); }",
  "      state.pending.push(it);",
  "    }",
  "    renderPending();",
  "  }",
  "  function renderPending() {",
  "    $('files').replaceChildren(...state.pending.map((it, i) => el('div', { class: 'file' }, [",
  "      el('div', { class: 'name', text: it.name }),",
  "      it.error ? el('div', { class: 'err', text: it.error }) : el('div', { class: 'info', text: it.info }),",
  "      it.error ? null : el('label', { class: 'info' }, ['対象月 ', el('input', { type: 'month', value: String(it.month).slice(0, 4) + '-' + String(it.month).slice(4), onchange: (e) => { it.month = Number(e.target.value.replace('-', '')); } })]),",
  "      it.status ? el('div', { class: it.status.indexOf('OK') === 0 ? 'ok' : 'err', text: it.status }) : null,",
  "      el('div', { class: 'dialog-actions' }, [el('button', { class: 'btn', type: 'button', text: '外す', onclick: () => { state.pending.splice(i, 1); renderPending(); } })]),",
  "    ])));",
  "    const ready = state.pending.filter((it) => !it.error && it.status.indexOf('OK') !== 0);",
  "    $('imp-go').disabled = !ready.length;",
  "  }",
  "  async function runImport() {",
  "    const ready = state.pending.filter((it) => !it.error && it.status.indexOf('OK') !== 0);",
  "    $('imp-go').disabled = true; $('imp-go').textContent = '取り込み中…（30秒ほど）';",
  "    try {",
  "      const messages = await gs('mxWebImport', ready.map((it) => ({ name: it.name, text: it.text, month: it.month })));",
  "      ready.forEach((it) => { const m = messages.find((x) => x.indexOf(it.name + '：') === 0); it.status = m ? m.slice(it.name.length + 1) : '結果を確認できませんでした'; });",
  "      await reload();",
  "    } catch (e) { ready.forEach((it) => (it.status = '取り込めませんでした：' + errText(e))); }",
  "    $('imp-go').textContent = '取り込む';",
  "    renderPending();",
  "  }",
  "",
  "  // ===== 判定基準・書き出し =====",
  "  function openCriteria() {",
  "    const c = state.cfg;",
  "    $('c-hours').value = c.hours; $('c-events').value = c.events; $('c-t2').value = c.t2; $('c-t1').value = c.t1; $('c-start').value = c.start;",
  "    $('cr-msg').textContent = ''; $('criteria-modal').hidden = false;",
  "  }",
  "  async function saveCriteria(e) {",
  "    e.preventDefault();",
  "    const body = { hours: +$('c-hours').value, events: +$('c-events').value, t2: +$('c-t2').value, t1: +$('c-t1').value, start: +$('c-start').value };",
  "    $('cr-msg').style.color = ''; $('cr-msg').textContent = '保存中…'; $('cr-save').disabled = true;",
  "    try { await gs('mxWebSaveConfig', body); await reload(); $('cr-msg').textContent = '保存しました'; }",
  "    catch (err) { $('cr-msg').style.color = 'var(--down)'; $('cr-msg').textContent = '保存できませんでした：' + errText(err); }",
  "    finally { $('cr-save').disabled = false; }",
  "  }",
  "  function exportMonth() {",
  "    const head = ['ユーザーID', '配信者名', '区分', '担当者', 'ティア', '前月ティア', '配信回数', '配信時間（h）', '売上', '会社売上', '前月 売上', '前々月 売上', '直近3ヶ月 配信h', 'ティア入り月', 'イベント3回', 'デビュー月', '初月判定', '判定理由', '次のティアまで', 'メモ'];",
  "    const q = (v) => { const s = String(v == null ? '' : v); return /[\",\\n]/.test(s) ? '\"' + s.replace(/\"/g, '\"\"') + '\"' : s; };",
  "    const lines = [head.join(',')].concat(state.list.map((x) => [x.id, x.name, x.group, x.owner, x.tier, x.prevTier, x.count, fmtH(x.hours), Math.round(x.sales), Math.round(x.company), Math.round(x.sales1), Math.round(x.sales2), fmtH(x.recent),",
  "      x.special || (x.entry ? mxMonthLabel(x.entry) : ''), x.event, x.debut ? mxMonthLabel(x.debut) : '', x.shoki, x.reason, x.next, x.memo].map(q).join(',')));",
  "    const a = el('a', { href: URL.createObjectURL(new Blob(['\\uFEFF' + lines.join('\\r\\n')], { type: 'text/csv' })), download: 'ミクチャ_ティア_' + state.sel + '.csv' });",
  "    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);",
  "  }",
  "",
  "  // ===== 読み込み =====",
  "  async function reload() {",
  "    const data = await gs('mxWebLoad');",
  "    state.rows = data.rows || []; state.masters = data.masters || {}; state.cfg = data.cfg; state.loaded = true;",
  "    const last = (data.log || [])[0];",
  "    $('last-import').textContent = last ? '最終取込：' + last[0] + '（' + last[1] + '・' + last[4] + '）' : '';",
  "    if (data.url) { $('sheet-link').href = data.url; $('sheet-link').hidden = false; }",
  "    render();",
  "  }",
  "",
  "  // ===== イベント =====",
  "  $('v-tier').addEventListener('click', () => { state.view = 'tier'; try { localStorage.setItem('mx-view', 'tier'); } catch (e) {} render(); });",
  "  $('v-sales').addEventListener('click', () => { state.view = 'sales'; try { localStorage.setItem('mx-view', 'sales'); } catch (e) {} render(); });",
  "  ['q', 'f-group', 'f-owner', 'f-active'].forEach((id) => $(id).addEventListener(id === 'q' ? 'input' : 'change', () => state.idx && renderBoard()));",
  "  $('btn-import').addEventListener('click', () => { state.pending = []; $('file').value = ''; renderPending(); $('import-modal').hidden = false; });",
  "  $('imp-close').addEventListener('click', () => ($('import-modal').hidden = true));",
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
  "  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('import-modal').hidden = true; $('criteria-modal').hidden = true; closeDrawer(); } });",
  "",
  "  render();",
  "  reload().catch((e) => { state.loaded = true; showNotice('スプレッドシートを読み込めませんでした：' + errText(e) + '。ページを再読み込みしてください。'); render(); });",
  "})();",
  "</script>",
].join('\n');
// </APP_HTML>
