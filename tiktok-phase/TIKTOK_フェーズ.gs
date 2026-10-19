// TikTok フェーズ判定：アカウントURLから再生数・投稿数を AI（Gemini）で調べ、SNS_フェーズ表と同じ基準でフェーズ分け
//
// 新しい Google スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使います。
//   1. 貼り付けて保存し、関数「setupTikTok」を実行（必要なシートを自動で作る・権限を許可）
//   2. スプレッドシートを開き直すとメニュー「TikTokフェーズ」が出る
//   3. メニュー「Gemini APIキーを設定」で、Google AI Studio で発行したキーを入れる（キーはシートには保存しない）
//   4. 「フェーズ判定」シートに 名前・TikTokのURL を入れて、メニュー「AIで再生数を調べてフェーズ判定」
//   5. 毎月1日に自動で判定するときは「毎月の自動判定をオンにする」
//   6. アプリとして使うときは「デプロイ → 新しいデプロイ → ウェブアプリ」
//      （次のユーザーとして実行：自分／アクセスできるユーザー：株式会社LIV 内の全員）
//
// フェーズの基準は「SNS_フェーズ表」のマニュアルと同じ（フェーズ4／3／3候補／2／1／フェーズ外／未判定）。
// AI は再生数・投稿数などの「数字を調べる」役で、フェーズはその数字からルールで決める（毎回同じ基準になるように）。

// ===== 設定 ===============================================================

const TK_SHEET = {
  manual: 'マニュアル',
  summary: 'サマリー',
  board: 'タレント分け',
  judge: 'フェーズ判定',
  history: '判定履歴',
  settings: '設定',
  log: '取得ログ',
};
const TK_PHASES = ['フェーズ4', 'フェーズ3', 'フェーズ3候補', 'フェーズ2', 'フェーズ1', 'フェーズ外', '未判定'];
const TK_PHASE_LABEL = {
  フェーズ4: '最終形', フェーズ3: '案件化期', フェーズ3候補: '承認待ち', フェーズ2: '成長期', フェーズ1: '初期', フェーズ外: 'LTV枠', 未判定: '未集計',
};
const TK_PHASE_COLOR = {
  フェーズ4: '#FFE599', フェーズ3: '#D9EAD3', フェーズ3候補: '#FCE5CD', フェーズ2: '#EAD1DC', フェーズ1: '#E8EEF7', フェーズ外: '#F3F3F3', 未判定: '#FFFFFF',
};
const TK_HEADER_BG = '#1F4E9A';
const TK_FIRST_ROW = 5; // フェーズ判定シートのデータ開始行
// フェーズ判定シートの列（1始まり）。A〜J は手入力、K から右は自動
const TK_COL = {
  name: 1, owner: 2, tiktok: 3, insta: 4, paid: 5, approve: 6, excluded: 7, avgManual: 8, postsManual: 9, memo: 10,
  phase: 11, prev: 12, change: 13, avg: 14, weekly: 15, reason: 16, next: 17,
  followers: 18, likes: 19, avgAi: 20, postsAi: 21, lastPost: 22, confidence: 23, aiNote: 24, fetchedAt: 25, status: 26,
};
const TK_HEAD = ['名前', '担当者', 'TikTok URL', 'Instagram URL（任意）', '有償案件（○）', '本部長承認（○）', 'フェーズ外（○）',
  '平均再生（手入力）', '投稿数／30日（手入力）', 'メモ',
  'フェーズ', '前月フェーズ', '変化', '判定に使った平均再生', '週あたり投稿', '判定理由', '次のフェーズまで',
  'フォロワー', 'いいね総数', '平均再生（AI）', '投稿数／30日（AI）', '最終投稿日', 'AIの確度', 'AIのコメント', '最終取得', '取得状況'];
const TK_HISTORY_HEAD = ['月キー', 'TikTok URL', '名前', '担当者', 'フェーズ', '平均再生', '週あたり投稿', 'フォロワー', '記録日時'];
const TK_TIME_BUDGET_MS = 4.5 * 60 * 1000; // 1回の実行（上限6分）で使う時間。残りは1分後に続きを自動実行

// ===== メニュー ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TikTokフェーズ')
    .addItem('AIで再生数を調べてフェーズ判定（今日まだの人）', 'tkUpdateAll')
    .addItem('選んだ行だけAIで調べ直す', 'tkUpdateSelected')
    .addItem('フェーズを再計算（AIは使わない）', 'tkRefreshAll')
    .addSeparator()
    .addItem('Gemini APIキーを設定', 'tkSetApiKey')
    .addItem('毎月の自動判定をオンにする（毎月1日 9時）', 'tkSetupTrigger')
    .addItem('はじめての設定（シートを作る）', 'setupTikTok')
    .addToUi();
}

/** 手入力の列（有償案件・承認・フェーズ外・手入力の数字）を変えたら、その行のフェーズをすぐ計算し直す */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TK_SHEET.judge || e.range.getRow() < TK_FIRST_ROW) return;
  const c = e.range.getColumn();
  if (c > TK_COL.memo) return;
  const cfg = tkReadConfig_(e.source);
  const prev = tkPrevPhases_(e.source, tkEvalMonth_(new Date()));
  for (let r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) tkWriteJudgement_(sheet, r, cfg, prev);
}

function setupTikTok() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tkEnsureSheets_(ss);
  tkRefreshAll_(ss);
  ss.toast('シートを用意しました。メニュー「TikTokフェーズ → Gemini APIキーを設定」のあと、フェーズ判定シートにURLを入れてください', 'TikTok', 10);
}

function tkSetApiKey() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Gemini APIキー', 'Google AI Studio（aistudio.google.com）で発行したAPIキーを貼り付けてください。\nスクリプトの中だけに保存され、シートには書かれません。', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const key = res.getResponseText().trim();
  if (!key) return;
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  ui.alert('保存しました。メニュー「AIで再生数を調べてフェーズ判定」で判定できます。');
}

function tkSetupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tkMonthlyUpdate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tkMonthlyUpdate').timeBased().onMonthDay(1).atHour(9).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('毎月1日 9時に全員を判定します（前月の確定値として記録）', 'TikTok', 8);
}

function tkMonthlyUpdate() {
  tkUpdateAll();
}

// ===== シート ==============================================================

function tkEnsureSheets_(ss) {
  let s = ss.getSheetByName(TK_SHEET.settings);
  if (!s) {
    s = ss.insertSheet(TK_SHEET.settings);
    s.getRange('A1').setValue('設定（黄色のセルは変更できます）').setFontWeight('bold').setFontSize(14);
    tkHeader_(s.getRange('A3:C3').setValues([['項目', '値', '説明']]));
    s.getRange('A4:C11').setValues([
      ['フェーズ4：平均再生（回）', 200000, '直近1か月の平均再生がこれ以上でフェーズ4（最終形）'],
      ['フェーズ3：平均再生（回）', 100000, 'これ以上、または有償案件獲得済みで、本部長承認○ならフェーズ3（なければ3候補）'],
      ['フェーズ2：週あたり投稿（本）', 3, '直近30日の投稿数×7÷30 がこれ以上でフェーズ2'],
      ['Gemini のモデル', 'gemini-3.8-flash', '古くなって使えなくなると、Gemini がすすめる新しいモデルに自動で書き換える'],
      ['目標人数：フェーズ4', '', ''],
      ['目標人数：フェーズ3', '', ''],
      ['目標人数：フェーズ2', '', ''],
      ['目標人数：フェーズ1', '', ''],
    ]);
    s.getRange('B4:B11').setBackground('#FFF2CC').setFontColor('#1155CC');
    s.getRange('B4:B5').setNumberFormat('#,##0');
    s.setColumnWidth(1, 240);
    s.setColumnWidth(2, 160);
    s.setColumnWidth(3, 520);
  }
  s = ss.getSheetByName(TK_SHEET.judge);
  if (!s) {
    s = ss.insertSheet(TK_SHEET.judge);
    tkEnsureCols_(s, TK_HEAD.length);
    s.getRange('A1').setValue('TikTok フェーズ判定').setFontSize(16).setFontWeight('bold').setFontColor(TK_HEADER_BG);
    s.getRange('A2').setValue('黄色の列（A〜J）を入力。名前とTikTokのURLを入れてメニュー「AIで再生数を調べてフェーズ判定」を押すと、右側（K列〜）が自動で埋まります。' +
      '平均再生・投稿数を手入力すると、AIの値より優先します。').setFontSize(9).setFontColor('#666666');
    tkHeader_(s.getRange(4, 1, 1, TK_HEAD.length).setValues([TK_HEAD]));
    s.getRange(4, 1, 1, TK_COL.memo).setBackground('#BF9000');
    s.getRange(TK_FIRST_ROW, 1, s.getMaxRows() - TK_FIRST_ROW + 1, TK_COL.memo).setBackground('#FFF2CC');
    s.getRange(4, 1, 1, TK_HEAD.length).setWrap(true).setVerticalAlignment('middle');
    s.setRowHeight(4, 42);
    s.setFrozenRows(4);
    s.setColumnWidth(TK_COL.name, 140);
    s.setColumnWidth(TK_COL.tiktok, 220);
    s.setColumnWidth(TK_COL.insta, 160);
    s.setColumnWidths(TK_COL.paid, 5, 90);
    s.setColumnWidth(TK_COL.memo, 160);
    s.setColumnWidth(TK_COL.reason, 260);
    s.setColumnWidth(TK_COL.next, 200);
    s.setColumnWidth(TK_COL.aiNote, 280);
  }
  s = ss.getSheetByName(TK_SHEET.history);
  if (!s) {
    s = ss.insertSheet(TK_SHEET.history);
    tkHeader_(s.getRange(1, 1, 1, TK_HISTORY_HEAD.length).setValues([TK_HISTORY_HEAD]));
    s.getRange('B:B').setNumberFormat('@');
    s.setFrozenRows(1);
  }
  s = ss.getSheetByName(TK_SHEET.log);
  if (!s) {
    s = ss.insertSheet(TK_SHEET.log);
    tkHeader_(s.getRange('A1:D1').setValues([['日時', '名前', 'URL', '結果']]));
    s.setFrozenRows(1);
  }
  let added = false;
  [TK_SHEET.manual, TK_SHEET.summary, TK_SHEET.board].forEach(function (n) {
    if (!ss.getSheetByName(n)) { ss.insertSheet(n); added = true; }
  });
  if (added) {
    ['manual', 'summary', 'board', 'judge', 'history', 'settings', 'log'].forEach(function (k, i) {
      ss.setActiveSheet(ss.getSheetByName(TK_SHEET[k]));
      ss.moveActiveSheet(i + 1);
    });
  }
  const blank = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
}

function tkReadConfig_(ss) {
  const v = ss.getSheetByName(TK_SHEET.settings).getRange('B4:B11').getValues().map(function (r) { return r[0]; });
  return {
    p4: tkNum_(v[0]) || 200000, p3: tkNum_(v[1]) || 100000, weekly: tkNum_(v[2]) || 3, model: String(v[3] || '').trim() || 'gemini-3.8-flash',
    targets: { フェーズ4: tkNum_(v[4]), フェーズ3: tkNum_(v[5]), フェーズ2: tkNum_(v[6]), フェーズ1: tkNum_(v[7]) },
  };
}

/** フェーズ判定シートの全行を {row, ...} で読む（名前もURLもない行は飛ばす） */
function tkReadRows_(ss) {
  const sheet = ss.getSheetByName(TK_SHEET.judge);
  const last = sheet.getLastRow();
  if (last < TK_FIRST_ROW) return [];
  const values = sheet.getRange(TK_FIRST_ROW, 1, last - TK_FIRST_ROW + 1, TK_HEAD.length).getValues();
  const out = [];
  values.forEach(function (v, i) {
    const r = tkRowObject_(v);
    if (!r.name && !r.tiktok) return;
    r.row = TK_FIRST_ROW + i;
    out.push(r);
  });
  return out;
}

function tkRowObject_(v) {
  const o = {};
  Object.keys(TK_COL).forEach(function (k) {
    const x = v[TK_COL[k] - 1];
    o[k] = x instanceof Date ? Utilities.formatDate(x, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : x == null ? '' : x;
  });
  o.name = String(o.name).trim();
  o.tiktok = String(o.tiktok).trim();
  return o;
}

// ===== フェーズ判定（アプリの画面でも同じ関数を使う） ========================
// ここから「tkShared」の終わりまでの関数は、アプリの画面にもそのまま埋め込まれる（GAS の関数に頼らない書き方にする）

function tkNumOrNull(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,，\s回本人]/g, ''));
  return isFinite(n) ? n : null;
}

/** 1人分のフェーズを決める。r：フェーズ判定シートの1行、cfg：設定 */
function tkJudge(r, cfg) {
  const yes = function (v) { return String(v || '').trim() === '○'; };
  const avgManual = tkNumOrNull(r.avgManual);
  const postsManual = tkNumOrNull(r.postsManual);
  const avg = avgManual !== null ? avgManual : tkNumOrNull(r.avgAi);
  const posts = postsManual !== null ? postsManual : tkNumOrNull(r.postsAi);
  const weekly = posts === null ? null : Math.round(posts * 7 / 30 * 10) / 10;
  const fmt = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  const src = avgManual !== null || postsManual !== null ? '（手入力）' : '';
  let phase;
  let reason;
  let next;
  if (yes(r.excluded)) {
    phase = 'フェーズ外';
    reason = '担当者がフェーズ外（LTV枠）に指定';
    next = '方針どおりの投稿を始めたらフェーズ1へ';
  } else if (avg === null && weekly === null) {
    phase = '未判定';
    reason = '再生数・投稿数が未集計';
    next = 'メニュー「AIで再生数を調べてフェーズ判定」で集計';
  } else if (avg !== null && avg >= cfg.p4) {
    phase = 'フェーズ4';
    reason = '平均再生' + fmt(avg) + '回（' + cfg.p4 / 10000 + '万回以上）' + src;
    next = '維持（有償案件 月3本・単価10万円〜）';
  } else if ((avg !== null && avg >= cfg.p3) || yes(r.paid)) {
    const why = avg !== null && avg >= cfg.p3 ? '平均再生' + fmt(avg) + '回（' + cfg.p3 / 10000 + '万回以上）' : '有償案件を獲得済み';
    if (yes(r.approve)) {
      phase = 'フェーズ3';
      reason = why + '・本部長承認済み' + src;
      next = 'フェーズ4へ：平均再生あと' + fmt(Math.max(0, cfg.p4 - (avg || 0))) + '回';
    } else {
      phase = 'フェーズ3候補';
      reason = why + '・本部長の承認待ち' + src;
      next = '本部長へ報告→承認でフェーズ3';
    }
  } else if (weekly !== null && weekly >= cfg.weekly) {
    phase = 'フェーズ2';
    reason = '週' + weekly + '本投稿（' + cfg.weekly + '本以上）' + (avg !== null ? '・平均再生' + fmt(avg) + '回' : '') + src;
    next = 'フェーズ3へ：平均再生あと' + fmt(Math.max(0, cfg.p3 - (avg || 0))) + '回 or 有償案件';
  } else {
    phase = 'フェーズ1';
    reason = (weekly !== null ? '週' + weekly + '本投稿（' + cfg.weekly + '本未満）' : '投稿数が不明') + (avg !== null ? '・平均再生' + fmt(avg) + '回' : '') + src;
    next = 'フェーズ2へ：まずは週' + cfg.weekly + '本投稿' + (weekly !== null ? '（あと週' + Math.max(0, Math.round((cfg.weekly - weekly) * 10) / 10) + '本）' : '');
  }
  return { phase: phase, avg: avg, weekly: weekly, reason: reason, next: next };
}

/** 前月とくらべた変化 */
function tkChange(phase, prev) {
  if (!prev) return '新規';
  if (phase === '未判定' || prev === '未判定' || phase === 'フェーズ外' || prev === 'フェーズ外') return phase === prev ? '維持' : '—';
  const a = TK_PHASES.indexOf(phase);
  const b = TK_PHASES.indexOf(prev);
  return a === b ? '維持' : a < b ? '昇格' : '降格';
}

/** "https://www.tiktok.com/@abc?lang=ja"・"@abc"・"abc" → "https://www.tiktok.com/@abc" */
function tkNormalizeUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/) || s.match(/^@?([A-Za-z0-9._]+)$/);
  return m ? 'https://www.tiktok.com/@' + m[1].toLowerCase() : s;
}

function tkMonthLabel(ym) {
  return Math.floor(ym / 100) + '年' + (ym % 100) + '月';
}
// ===== tkShared の終わり ====================================================

/** 評価月：取得日の前日が属する月（毎月1日に更新すると前月の確定値として記録される） */
function tkEvalMonth_(d) {
  const x = new Date(d.getTime() - 24 * 3600 * 1000);
  return x.getFullYear() * 100 + x.getMonth() + 1;
}

function tkAddMonths_(ym, k) {
  const t = Math.floor(ym / 100) * 12 + (ym % 100) - 1 + k;
  return Math.floor(t / 12) * 100 + (t % 12) + 1;
}

/** 判定履歴から、ある月の {URL: フェーズ}。前月フェーズの表示に使う */
function tkHistoryRows_(ss) {
  const sheet = ss.getSheetByName(TK_SHEET.history);
  const last = sheet.getLastRow();
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, TK_HISTORY_HEAD.length).getValues();
}

function tkPrevPhases_(ss, month) {
  const prevMonth = tkAddMonths_(month, -1);
  const out = {};
  tkHistoryRows_(ss).forEach(function (r) {
    if (Number(r[0]) === prevMonth) out[tkNormalizeUrl(r[1])] = String(r[4]);
  });
  return out;
}

/** 1行のフェーズ・理由（K〜Q列）を書き込む */
function tkWriteJudgement_(sheet, row, cfg, prev) {
  const r = tkRowObject_(sheet.getRange(row, 1, 1, TK_HEAD.length).getValues()[0]);
  if (!r.name && !r.tiktok) {
    sheet.getRange(row, TK_COL.phase, 1, TK_COL.next - TK_COL.phase + 1).clearContent();
    return null;
  }
  const j = tkJudge(r, cfg);
  const p = prev[tkNormalizeUrl(r.tiktok)] || '';
  sheet.getRange(row, TK_COL.phase, 1, TK_COL.next - TK_COL.phase + 1).setValues([[
    j.phase, p, tkChange(j.phase, p), j.avg === null ? '' : Math.round(j.avg), j.weekly === null ? '' : j.weekly, j.reason, j.next,
  ]]);
  return j;
}

/** 全員のフェーズを計算し直し、サマリー・タレント分け・マニュアルを作り直す（AIは使わない） */
function tkRefreshAll() {
  tkRefreshAll_(SpreadsheetApp.getActiveSpreadsheet());
}

function tkRefreshAll_(ss) {
  tkEnsureSheets_(ss);
  const sheet = ss.getSheetByName(TK_SHEET.judge);
  const cfg = tkReadConfig_(ss);
  const month = tkEvalMonth_(new Date());
  const prev = tkPrevPhases_(ss, month);
  const last = sheet.getLastRow();
  if (last >= TK_FIRST_ROW) {
    const values = sheet.getRange(TK_FIRST_ROW, 1, last - TK_FIRST_ROW + 1, TK_HEAD.length).getValues();
    const out = values.map(function (v) {
      const r = tkRowObject_(v);
      if (!r.name && !r.tiktok) return ['', '', '', '', '', '', ''];
      const j = tkJudge(r, cfg);
      const p = prev[tkNormalizeUrl(r.tiktok)] || '';
      return [j.phase, p, tkChange(j.phase, p), j.avg === null ? '' : Math.round(j.avg), j.weekly === null ? '' : j.weekly, j.reason, j.next];
    });
    sheet.getRange(TK_FIRST_ROW, TK_COL.phase, out.length, 7).setValues(out);
    sheet.getRange(TK_FIRST_ROW, TK_COL.avg, out.length, 1).setNumberFormat('#,##0');
    const phaseRange = sheet.getRange(TK_FIRST_ROW, TK_COL.phase, sheet.getMaxRows() - TK_FIRST_ROW + 1, 1);
    const changeRange = sheet.getRange(TK_FIRST_ROW, TK_COL.change, sheet.getMaxRows() - TK_FIRST_ROW + 1, 1);
    sheet.setConditionalFormatRules(TK_PHASES.map(function (t) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(TK_PHASE_COLOR[t]).setBold(true).setRanges([phaseRange]).build();
    }).concat([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('昇格').setFontColor('#0B8043').setBold(true).setRanges([changeRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('降格').setFontColor('#CC0000').setBold(true).setRanges([changeRange]).build(),
    ]));
  }
  tkRenderSummary_(ss);
  tkRenderBoard_(ss);
  tkRenderManual_(ss);
}

// ===== AI で数字を調べる =====================================================

/** 今日まだ調べていない人を順に調べる。時間が足りなければ1分後に続きを自動実行 */
function tkUpdateAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tkEnsureSheets_(ss);
  const start = Date.now();
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  // 今日うまく調べられた人だけ飛ばす（エラーだった人・数字が取れなかった人は、もう一度押すと調べ直す）
  const doneToday = function (r) {
    return String(r.fetchedAt).indexOf(today) === 0 && String(r.status).indexOf('OK') === 0 && (r.avgAi !== '' || r.postsAi !== '');
  };
  const rows = tkReadRows_(ss).filter(function (r) { return r.tiktok && !doneToday(r); });
  let done = 0;
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - start > TK_TIME_BUDGET_MS) break;
    tkUpdateRow_(ss, rows[i].row);
    done++;
  }
  tkClearContinuation_();
  const rest = rows.length - done;
  if (rest > 0) ScriptApp.newTrigger('tkUpdateAll').timeBased().after(60 * 1000).create();
  tkRefreshAll_(ss);
  ss.toast(done + '人を調べました' + (rest > 0 ? '。残り' + rest + '人は1分後に自動で続けます' : '（全員完了）'), 'TikTok', 10);
}

function tkClearContinuation_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tkUpdateAll' && t.getEventType() === ScriptApp.EventType.CLOCK) ScriptApp.deleteTrigger(t);
  });
}

function tkUpdateSelected() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const range = ss.getActiveRange();
  if (!range || range.getSheet().getName() !== TK_SHEET.judge) {
    SpreadsheetApp.getUi().alert('「フェーズ判定」シートで、調べ直したい人の行を選んでから実行してください');
    return;
  }
  for (let r = Math.max(range.getRow(), TK_FIRST_ROW); r < range.getRow() + range.getNumRows(); r++) tkUpdateRow_(ss, r);
  tkRefreshAll_(ss);
}

/** 1人分：TikTokのページから数字を読み、Gemini で直近30日の再生・投稿を調べて書き込む */
function tkUpdateRow_(ss, row) {
  const sheet = ss.getSheetByName(TK_SHEET.judge);
  const r = tkRowObject_(sheet.getRange(row, 1, 1, TK_HEAD.length).getValues()[0]);
  if (!r.tiktok) return null;
  const url = tkNormalizeUrl(r.tiktok);
  const cfg = tkReadConfig_(ss);
  let profile = null;
  try {
    profile = tkFetchProfile_(url);
  } catch (e) {
    profile = null;
  }
  let ai = null;
  let status;
  try {
    ai = tkAskGemini_(url, String(r.insta || '').trim(), profile, cfg.model);
    if (ai.model) ss.getSheetByName(TK_SHEET.settings).getRange('B7').setValue(ai.model); // 次からは新しいモデルを使う
    status = 'OK' + (profile ? '' : '（ページの数字は取得できずAIのみ）');
  } catch (e) {
    status = 'エラー：' + (e && e.message ? e.message : e);
  }
  const pick = function (a, b) { return a !== null && a !== undefined ? a : b; };
  const followers = pick(profile && profile.followers, ai && ai.followers);
  const values = [[
    followers == null ? r.followers : followers,
    pick(profile && profile.likes, r.likes),
    ai && ai.avgViews !== null ? Math.round(ai.avgViews) : ai ? '' : r.avgAi,
    ai && ai.posts30 !== null ? ai.posts30 : ai ? '' : r.postsAi,
    ai && ai.lastPost ? ai.lastPost : ai ? '' : r.lastPost,
    ai ? ai.confidence : r.confidence,
    ai ? ai.note : r.aiNote,
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
    status,
  ]];
  sheet.getRange(row, TK_COL.followers, 1, values[0].length).setValues(values);
  sheet.getRange(row, TK_COL.followers, 1, 3).setNumberFormat('#,##0');
  const month = tkEvalMonth_(new Date());
  const j = tkWriteJudgement_(sheet, row, cfg, tkPrevPhases_(ss, month));
  if (j && ai) tkRecordHistory_(ss, month, url, r, j, followers);
  ss.getSheetByName(TK_SHEET.log).appendRow([new Date(), r.name, url, status]);
  return j;
}

/** 判定履歴に、その月の結果を1人1行で記録（同じ月は上書き） */
function tkRecordHistory_(ss, month, url, r, j, followers) {
  const sheet = ss.getSheetByName(TK_SHEET.history);
  const rows = tkHistoryRows_(ss);
  const line = [month, url, r.name, r.owner, j.phase, j.avg === null ? '' : Math.round(j.avg), j.weekly === null ? '' : j.weekly,
    followers == null ? '' : followers, new Date()];
  let at = -1;
  rows.forEach(function (h, i) { if (Number(h[0]) === month && tkNormalizeUrl(h[1]) === url) at = i; });
  if (at >= 0) sheet.getRange(at + 2, 1, 1, line.length).setValues([line]);
  else sheet.appendRow(line);
}

/** TikTokのプロフィールページから、フォロワー・いいね総数・投稿数を読む（読めなければ null） */
function tkFetchProfile_(url) {
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'ja,en;q=0.8',
    },
  });
  if (res.getResponseCode() !== 200) return null;
  return tkParseProfileHtml_(res.getContentText());
}

function tkParseProfileHtml_(html) {
  const m = String(html).match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
  const detail = data && data.__DEFAULT_SCOPE__ && data.__DEFAULT_SCOPE__['webapp.user-detail'];
  const info = detail && detail.userInfo;
  if (!info || !info.stats) return null;
  const st = info.statsV2 || info.stats;
  const n = function (v) { const x = tkNumOrNull(v); return x === null ? null : x; };
  return {
    handle: info.user ? info.user.uniqueId : '', nickname: info.user ? info.user.nickname : '',
    followers: n(st.followerCount), likes: n(st.heartCount != null ? st.heartCount : st.heart), videos: n(st.videoCount),
  };
}

/** Gemini に直近30日の投稿数・平均再生を調べてもらう（URLを開く機能とGoogle検索を使う） */
function tkAskGemini_(url, insta, profile, model) {
  try {
    return tkAskGeminiModel_(url, insta, profile, model);
  } catch (e) {
    // 「このモデルはもう使えません。models/○○ を使ってください」と返ってきたら、すすめられたモデルでやり直す
    const m = String(e && e.message).match(/Gemini 404[\s\S]*?use (?:models\/)?([a-z0-9][\w.-]*[a-z0-9])/i);
    if (!m || m[1] === model) throw e;
    const res = tkAskGeminiModel_(url, insta, profile, m[1]);
    res.model = m[1];
    return res;
  }
}

function tkAskGeminiModel_(url, insta, profile, model) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Gemini APIキーが未設定です（メニュー「Gemini APIキーを設定」）');
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const prompt = [
    'あなたはSNSマネジメント会社のアシスタントです。次のTikTokアカウントの直近30日の投稿を調べてください。',
    'TikTok: ' + url,
    insta ? 'Instagram: ' + insta + '（リールの再生数がTikTokより多ければ、多いほうを使う）' : '',
    profile ? 'ページから読めた数字：フォロワー ' + profile.followers + '、いいね総数 ' + profile.likes + '、投稿数（累計）' + profile.videos : '',
    '今日は ' + today + ' です。',
    'ルール：',
    '- 投稿数：今日までの30日間に投稿された数（TikTokは動画・写真。Instagramはフィード・リール。ストーリーズは数えない）',
    '- 平均再生：その30日間の投稿の再生数の平均。ただし投稿から3日未満の投稿は除く',
    '- 確かめられない数字は null にする（推測で埋めない）',
    '答えは次のJSONだけを返してください（説明文やコードブロックは不要）：',
    '{"followers": 数値またはnull, "posts_30d": 数値またはnull, "avg_views_30d": 数値またはnull, "last_post_date": "YYYY-MM-DD"またはnull,',
    ' "confidence": "高" または "中" または "低", "note": "日本語で1〜2文。数字の根拠や、伸びている投稿の特徴など"}',
  ].filter(Boolean).join('\n');
  // まず Gemini API（AI Studio のキー。AIza… も AQ.… も、お支払い設定なしで使える）に送る。
  // そのキーが Gemini API で使えないときだけ、Vertex AI（Google Cloud・お支払い設定が必要）に送り直す
  const gemini = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const vertex = 'https://aiplatform.googleapis.com/v1/publishers/google/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const send = function (endpoint, tools) {
    return UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: endpoint === gemini ? { 'x-goog-api-key': key } : {},
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: tools, generationConfig: { temperature: 0 } }),
    });
  };
  const ask = function (endpoint) {
    let r = send(endpoint, [{ url_context: {} }, { google_search: {} }]);
    // URLを開く機能が使えないモデル・環境では、Google検索だけでもう一度
    if (r.getResponseCode() === 400 && /url_context|url context|tool/i.test(r.getContentText())) r = send(endpoint, [{ google_search: {} }]);
    return r;
  };
  let res = ask(gemini);
  // 429（回数の上限）：1分あたりの上限なら、Gemini が指定する秒数だけ待って1回だけやり直す。無料枠がないモデルなら分かるように伝える
  if (res.getResponseCode() === 429) {
    const text = res.getContentText();
    if (/limit:\s*0\b/.test(text)) {
      throw new Error('Gemini 429：このモデル（' + model + '）は無料枠では使えません。設定シートB7を無料枠のあるモデル（aistudio.google.com/usage で確認）にするか、お支払い設定をしてください');
    }
    const wait = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    const sec = wait ? Math.ceil(Number(wait[1])) + 1 : 30;
    if (sec <= 60) {
      Utilities.sleep(sec * 1000);
      res = ask(gemini);
    }
  }
  if (/^AQ\./.test(key) && [400, 401, 403].indexOf(res.getResponseCode()) >= 0 && /api key|API_KEY|credential|authentic/i.test(res.getContentText())) {
    res = ask(vertex);
  }
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) {
    let msg = body;
    try { msg = JSON.parse(body).error.message; } catch (e) { /* そのまま */ }
    if (code === 429) {
      throw new Error('Gemini 429：使える回数の上限です。1日の上限なら明日、1分の上限なら数分おいて、もう一度メニューを押してください（' + String(msg).slice(0, 120) + '）');
    }
    throw new Error('Gemini ' + code + '：' + String(msg).slice(0, 300));
  }
  return tkParseGemini_(body);
}

/** Gemini の応答から JSON を取り出す */
function tkParseGemini_(body) {
  const data = typeof body === 'string' ? JSON.parse(body) : body;
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map(function (p) { return p.text || ''; }).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AIの答えを読み取れませんでした：' + text.slice(0, 120));
  const j = JSON.parse(m[0]);
  const conf = String(j.confidence || '').trim();
  return {
    followers: tkNumOrNull(j.followers), posts30: tkNumOrNull(j.posts_30d), avgViews: tkNumOrNull(j.avg_views_30d),
    lastPost: j.last_post_date ? String(j.last_post_date) : '', confidence: ['高', '中', '低'].indexOf(conf) >= 0 ? conf : '低',
    note: String(j.note || '').slice(0, 300),
  };
}

// ===== 表示（シート） ======================================================

function tkRenderSummary_(ss) {
  const sheet = ss.getSheetByName(TK_SHEET.summary);
  const keep = {};
  if (sheet.getLastRow() >= 5) {
    sheet.getRange(5, 1, Math.min(sheet.getLastRow() - 4, 12), 11).getValues().forEach(function (r) {
      const t = String(r[0] || '').trim();
      if (TK_PHASES.indexOf(t) >= 0) keep[t] = { start: r[5], add: r[6], owner: r[10] };
    });
  }
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  tkEnsureCols_(sheet, 14);
  const cfg = tkReadConfig_(ss);
  const rows = tkReadRows_(ss);
  const month = tkEvalMonth_(new Date());
  const prev = tkPrevPhases_(ss, month);
  const list = rows.map(function (r) { return { r: r, j: tkJudge(r, cfg) }; });
  const counted = list.filter(function (x) { return x.j.phase !== 'フェーズ外'; }).length;
  sheet.getRange('A1').setValue('TikTok フェーズ別 人数サマリー').setFontSize(16).setFontWeight('bold').setFontColor(TK_HEADER_BG);
  sheet.getRange('A2').setValue('「フェーズ判定」シートから自動集計。フェーズ外（LTV枠）は構成比に数えません。黄色の列は手入力で、更新しても消えません。')
    .setFontSize(9).setFontColor('#666666');
  const head = ['フェーズ', '段階', '現在（自動）', '構成比', '前月（自動）', '月初の人数（手入力）', '今月の新規目標', '目標（計）', '増えた人数', 'あと何名', '担当'];
  tkHeader_(sheet.getRange(4, 1, 1, head.length).setValues([head]));
  const prevCount = {};
  Object.keys(prev).forEach(function (u) { prevCount[prev[u]] = (prevCount[prev[u]] || 0) + 1; });
  const out = TK_PHASES.map(function (t, i) {
    const r = 5 + i;
    const n = list.filter(function (x) { return x.j.phase === t; }).length;
    const k = keep[t] || {};
    return [t, TK_PHASE_LABEL[t], n, t === 'フェーズ外' || !counted ? '' : n / counted, Object.keys(prev).length ? prevCount[t] || 0 : '',
      k.start == null ? '' : k.start, k.add == null || k.add === '' ? (cfg.targets[t] || '') : k.add,
      '=IF(G' + r + '="","",IF(F' + r + '="",G' + r + ',F' + r + '+G' + r + '))', '=IF(F' + r + '="","",C' + r + '-F' + r + ')',
      '=IF(H' + r + '="","",MAX(H' + r + '-C' + r + ',0))', k.owner == null ? '' : k.owner];
  });
  out.push(['合計', '', list.length, '', '', '', '', '', '', '', '']);
  sheet.getRange(5, 1, out.length, head.length).setValues(out);
  sheet.getRange(5, 4, out.length, 1).setNumberFormat('0.0%');
  sheet.getRange(5, 6, TK_PHASES.length, 2).setBackground('#FFF2CC');
  sheet.getRange(5, 11, TK_PHASES.length, 1).setBackground('#FFF2CC');
  TK_PHASES.forEach(function (t, i) { sheet.getRange(5 + i, 1).setBackground(TK_PHASE_COLOR[t]).setFontWeight('bold'); });
  sheet.getRange(5 + TK_PHASES.length, 1, 1, head.length).setFontWeight('bold').setBackground('#F3F3F3');
  tkBorder_(sheet.getRange(4, 1, out.length + 1, head.length));

  // 担当者別
  let top = 5 + out.length + 2;
  const owners = [];
  list.forEach(function (x) { const o = String(x.r.owner || '').trim() || '（未設定）'; if (owners.indexOf(o) < 0) owners.push(o); });
  if (owners.length) {
    sheet.getRange(top, 1).setValue('担当者別').setFontWeight('bold');
    const oh = ['担当者'].concat(TK_PHASES, ['合計']);
    tkHeader_(sheet.getRange(top + 1, 1, 1, oh.length).setValues([oh]));
    const orows = owners.map(function (o) {
      const mine = list.filter(function (x) { return (String(x.r.owner || '').trim() || '（未設定）') === o; });
      return [o].concat(TK_PHASES.map(function (t) { return mine.filter(function (x) { return x.j.phase === t; }).length; }), [mine.length]);
    });
    sheet.getRange(top + 2, 1, orows.length, oh.length).setValues(orows);
    tkBorder_(sheet.getRange(top + 1, 1, orows.length + 1, oh.length));
    top += orows.length + 4;
  }

  // 月別の推移（判定履歴から）
  const hist = tkHistoryRows_(ss);
  const months = [];
  hist.forEach(function (h) { const m = Number(h[0]); if (m && months.indexOf(m) < 0) months.push(m); });
  months.sort(function (a, b) { return a - b; });
  if (months.length) {
    sheet.getRange(top, 1).setValue('月別の推移（判定履歴）').setFontWeight('bold');
    const mh = ['月'].concat(TK_PHASES, ['合計']);
    tkHeader_(sheet.getRange(top + 1, 1, 1, mh.length).setValues([mh]));
    const mrows = months.map(function (m) {
      const hs = hist.filter(function (h) { return Number(h[0]) === m; });
      return [tkMonthLabel(m)].concat(TK_PHASES.map(function (t) { return hs.filter(function (h) { return String(h[4]) === t; }).length; }), [hs.length]);
    });
    sheet.getRange(top + 2, 1, mrows.length, mh.length).setValues(mrows);
    tkBorder_(sheet.getRange(top + 1, 1, mrows.length + 1, mh.length));
  }
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidths(2, 10, 96);
  sheet.setRowHeight(4, 36);
  sheet.getRange(4, 1, 1, head.length).setWrap(true).setVerticalAlignment('middle');
}

function tkRenderBoard_(ss) {
  const sheet = ss.getSheetByName(TK_SHEET.board);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  const cfg = tkReadConfig_(ss);
  const prev = tkPrevPhases_(ss, tkEvalMonth_(new Date()));
  const list = tkReadRows_(ss).map(function (r) { return { r: r, j: tkJudge(r, cfg) }; });
  sheet.getRange('A1').setValue('TikTok フェーズ別メンバー').setFontSize(16).setFontWeight('bold').setFontColor(TK_HEADER_BG);
  sheet.getRange('A2').setValue('「フェーズ判定」シートの結果から自動で振り分け（平均再生の多い順）。前月＝判定履歴の前月のフェーズ').setFontSize(9).setFontColor('#666666');
  const width = 5;
  const groups = TK_PHASES.map(function (t) {
    return list.filter(function (x) { return x.j.phase === t; }).sort(function (a, b) { return (b.j.avg || 0) - (a.j.avg || 0); });
  });
  const maxLen = Math.max(1, Math.max.apply(null, groups.map(function (g) { return g.length; })));
  const grid = [];
  for (let i = 0; i < maxLen + 2; i++) grid.push(new Array(TK_PHASES.length * width).fill(''));
  TK_PHASES.forEach(function (t, g) {
    const c = g * width;
    grid[0][c] = t + '（' + TK_PHASE_LABEL[t] + '）｜' + groups[g].length + '人';
    grid[1][c] = 'No.'; grid[1][c + 1] = '名前'; grid[1][c + 2] = '平均再生'; grid[1][c + 3] = '前月';
    if (!groups[g].length) grid[2][c + 1] = '該当者なし';
    groups[g].forEach(function (x, i) {
      grid[2 + i][c] = i + 1;
      grid[2 + i][c + 1] = x.r.name || x.r.tiktok;
      grid[2 + i][c + 2] = x.j.avg === null ? '' : Math.round(x.j.avg);
      grid[2 + i][c + 3] = prev[tkNormalizeUrl(x.r.tiktok)] || '新規';
    });
  });
  tkEnsureRows_(sheet, 4 + grid.length);
  tkEnsureCols_(sheet, grid[0].length);
  sheet.getRange(4, 1, grid.length, grid[0].length).setValues(grid);
  TK_PHASES.forEach(function (t, g) {
    const c = 1 + g * width;
    sheet.getRange(4, c, 1, width - 1).merge().setBackground(TK_PHASE_COLOR[t]).setFontWeight('bold');
    tkHeader_(sheet.getRange(5, c, 1, width - 1));
    sheet.getRange(6, c + 2, maxLen, 1).setNumberFormat('#,##0');
    sheet.setColumnWidth(c, 36);
    sheet.setColumnWidth(c + 1, 150);
    sheet.setColumnWidth(c + 2, 80);
    sheet.setColumnWidth(c + 3, 90);
    if (g < TK_PHASES.length - 1) sheet.setColumnWidth(c + 4, 14);
  });
}

function tkRenderManual_(ss) {
  const sheet = ss.getSheetByName(TK_SHEET.manual);
  const c = tkReadConfig_(ss);
  const p4 = c.p4 / 10000;
  const p3 = c.p3 / 10000;
  const blocks = [
    [['TikTok フェーズ判定 運用マニュアル']],
    [['TikTokのアカウントURLを入れると、AI（Gemini）が直近30日の投稿数・平均再生を調べ、下の基準でフェーズを判定します。']],
    [],
    [['1. フェーズの定義と移行条件']],
    [['フェーズ', '条件', '判定に使う数値', '昇格条件（次のフェーズへ）', '降格・維持の条件', '次に目指すこと']],
    [['フェーズ4', '直近1か月の平均再生' + p4 + '万回以上（本体・専属レベル）', '直近1か月の平均再生（TikTok・Instagramの多い方）', '最上位', '平均再生' + p4 + '万回未満でフェーズ3以下へ', '維持（有償案件 月3本・単価10万円〜）'],
      ['フェーズ3', '直近1か月の平均再生' + p3 + '万回以上、または有償案件を獲得済み＋本部長承認', '同上＋有償案件の有無（手入力）＋本部長承認（手入力）', 'フェーズ4へ：平均再生' + p4 + '万回以上', '平均再生' + p3 + '万回未満かつ有償案件なしでフェーズ2以下へ', '平均再生' + p4 + '万回'],
      ['フェーズ3候補', 'フェーズ3の条件を満たし、本部長の承認待ち。随時本部長へ報告し、承認後にフェーズ3へ', '同上', 'フェーズ3へ：本部長承認', '条件を満たさなくなったらフェーズ2以下へ', '本部長承認'],
      ['フェーズ2', '週' + c.weekly + '本以上投稿', '直近1か月の投稿数（週換算、TikTok・IGの多い方）', 'フェーズ3へ：平均再生' + p3 + '万回以上 or 有償案件獲得', '週' + c.weekly + '本未満でフェーズ1へ', '平均再生' + p3 + '万回・ギフティング→有償案件'],
      ['フェーズ1', '週' + c.weekly + '本未満', '同上', 'フェーズ2へ：週' + c.weekly + '本以上投稿', '—', 'まずは週' + c.weekly + '本投稿'],
      ['フェーズ外', '育成方針に乗らない人を担当者が手入力で指定（LTV枠）。フェーズの人数には数えない', '担当者の判断（手入力）', 'フェーズ1へ：方針どおりの投稿を開始', '—', '方針どおりの投稿'],
      ['未判定', '再生数・投稿数が未集計', '—', 'AIで調べると判定', '—', '—']],
    [],
    [['判定の細則']],
    [['項目', 'ルール']],
    [['平均再生', '直近30日の投稿の再生数の平均。投稿から3日未満の投稿は除外。TikTokとInstagram（リール）の多い方を使う'],
      ['投稿数', '直近30日の投稿数×7÷30（週あたり）。TikTokは動画・写真、Instagramはフィード・リールすべて。ストーリーズは数えない'],
      ['AIの役割', 'Gemini がプロフィールと投稿を見て、投稿数・平均再生・最終投稿日を調べる。フェーズはその数字から上の基準で決める（AIが勝手にフェーズを変えない）'],
      ['手入力が優先', '「平均再生（手入力）」「投稿数／30日（手入力）」に数字を入れると、AIの値より優先する。AIの確度が「低」のときは確認して手入力'],
      ['評価の周期', '月1回（前月の確定値で判定）。毎月1日に自動で全員を判定し、判定履歴に前月分として記録。途中で調べると今月の途中経過'],
      ['フェーズ3', '平均再生' + p3 + '万回以上か有償案件（○）で条件達成。本部長承認（○）でフェーズ3、それまではフェーズ3候補']],
    [],
    [['2. 使い方']],
    [['手順', 'やること']],
    [['1', 'フェーズ判定シートに 名前・担当者・TikTokのURL（任意でInstagramのURL）を入れる'],
      ['2', 'メニュー「TikTokフェーズ → AIで再生数を調べてフェーズ判定」を押す（1人10〜20秒。多いときは1分ごとに自動で続きを実行）'],
      ['3', '有償案件・本部長承認・フェーズ外は○を手入力。入れるとすぐフェーズが変わる'],
      ['4', 'サマリー・タレント分けは自動で更新。アプリ（ウェブアプリ）でも同じ内容を見られる']],
  ];
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  tkEnsureCols_(sheet, 6);
  let row = 1;
  blocks.forEach(function (b) {
    if (!b.length) { row++; return; }
    const w = Math.max.apply(null, b.map(function (x) { return x.length; }));
    const vals = b.map(function (x) { return x.concat(new Array(w - x.length).fill('')); });
    tkEnsureRows_(sheet, row + vals.length);
    sheet.getRange(row, 1, vals.length, w).setValues(vals).setWrap(true).setVerticalAlignment('middle');
    const first = String(vals[0][0]);
    if (vals.length === 1 && w === 1) {
      if (row === 1) sheet.getRange(row, 1).setFontSize(16).setFontWeight('bold').setFontColor(TK_HEADER_BG).setWrap(false);
      else if (/^\d\.|^判定の細則/.test(first)) sheet.getRange(row, 1).setFontSize(12).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(TK_HEADER_BG).setWrap(false);
      else sheet.getRange(row, 1).setFontSize(9).setFontColor('#666666').setWrap(false);
    } else if (['フェーズ', '項目', '手順'].indexOf(first) >= 0 && vals.length === 1) {
      sheet.getRange(row, 1, 1, w).setBackground('#6D9EEB').setFontColor('#FFFFFF').setFontWeight('bold');
    } else {
      tkBorder_(sheet.getRange(row, 1, vals.length, w));
      if (first === 'フェーズ4') vals.forEach(function (v, i) { sheet.getRange(row + i, 1).setBackground(TK_PHASE_COLOR[v[0]]).setFontWeight('bold'); });
    }
    row += vals.length;
  });
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidths(2, 5, 230);
}

// ===== アプリ（ウェブアプリの画面） ==========================================

function doGet() {
  // 画面とサーバーで同じ判定をするため、判定の関数をそのまま画面に埋め込む
  const shared = [tkNumOrNull, tkJudge, tkChange, tkNormalizeUrl, tkMonthLabel].map(function (f) { return f.toString(); }).join('\n') +
    '\nconst TK_PHASES = ' + JSON.stringify(TK_PHASES) + ';\nconst TK_PHASE_LABEL = ' + JSON.stringify(TK_PHASE_LABEL) + ';';
  return HtmlService.createHtmlOutput(TK_APP_HTML_.replace('/*__TK_SHARED__*/', shared))
    .setTitle('TikTok フェーズ判定')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 画面から：データ一式 */
function tkWebLoad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tkEnsureSheets_(ss);
  const month = tkEvalMonth_(new Date());
  return {
    rows: tkReadRows_(ss),
    prev: tkPrevPhases_(ss, month),
    history: tkHistoryRows_(ss).map(function (h) { return [Number(h[0]), tkNormalizeUrl(h[1]), String(h[4])]; }),
    cfg: tkReadConfig_(ss),
    month: month,
    hasKey: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'),
    url: ss.getUrl(),
  };
}

/** 画面から：手入力の列を保存（row はフェーズ判定シートの行番号、url で本人か確かめる） */
function tkWebSave(row, url, f) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tkWithLock_(function () {
    const sheet = ss.getSheetByName(TK_SHEET.judge);
    const cur = tkNormalizeUrl(sheet.getRange(row, TK_COL.tiktok).getValue());
    if (row < TK_FIRST_ROW || cur !== tkNormalizeUrl(url)) throw new Error('行がずれています。ページを再読み込みしてください');
    sheet.getRange(row, 1, 1, TK_COL.memo).setValues([[
      f.name || '', f.owner || '', f.tiktok || '', f.insta || '', f.paid || '', f.approve || '', f.excluded || '',
      f.avgManual === '' || f.avgManual == null ? '' : Number(f.avgManual), f.postsManual === '' || f.postsManual == null ? '' : Number(f.postsManual), f.memo || '',
    ]]);
    tkRefreshAll_(ss);
  });
  return true;
}

/** 画面から：アカウントを追加 */
function tkWebAdd(f) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const url = tkNormalizeUrl(f.tiktok);
  if (!/tiktok\.com\/@/.test(url)) throw new Error('TikTokのURL（https://www.tiktok.com/@…）を入れてください');
  let row;
  tkWithLock_(function () {
    tkEnsureSheets_(ss);
    if (tkReadRows_(ss).some(function (r) { return tkNormalizeUrl(r.tiktok) === url; })) throw new Error('このアカウントはもう登録されています');
    const sheet = ss.getSheetByName(TK_SHEET.judge);
    row = Math.max(sheet.getLastRow(), TK_FIRST_ROW - 1) + 1;
    tkEnsureRows_(sheet, row);
    sheet.getRange(row, 1, 1, 4).setValues([[f.name || '', f.owner || '', url, f.insta || '']]);
    tkRefreshAll_(ss);
  });
  return row;
}

/** 画面から：1人をAIで調べる */
function tkWebJudge(row, url) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let j;
  tkWithLock_(function () {
    const sheet = ss.getSheetByName(TK_SHEET.judge);
    if (tkNormalizeUrl(sheet.getRange(row, TK_COL.tiktok).getValue()) !== tkNormalizeUrl(url)) throw new Error('行がずれています。ページを再読み込みしてください');
    j = tkUpdateRow_(ss, row);
    tkRefreshAll_(ss);
  });
  return j;
}

// ===== 小物 ================================================================

function tkNum_(v) {
  const n = tkNumOrNull(v);
  return n === null ? 0 : n;
}

function tkHeader_(range) {
  return range.setBackground(TK_HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
}

function tkBorder_(range) {
  range.setBorder(true, true, true, true, true, true, '#D9D9D9', SpreadsheetApp.BorderStyle.SOLID);
}

function tkEnsureRows_(sheet, n) {
  if (sheet.getMaxRows() < n) sheet.insertRowsAfter(sheet.getMaxRows(), n - sheet.getMaxRows());
}

function tkEnsureCols_(sheet, n) {
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
}

function tkWithLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5 * 60 * 1000)) throw new Error('別の処理が実行中です。しばらくしてから再実行してください');
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

// <APP_HTML>
const TK_APP_HTML_ = [
  "<title>TikTok フェーズ判定</title>",
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
  "  --accent: #1f4e9a;",
  "  --accent-fg: #ffffff;",
  "  --accent-soft: #e3ebf7;",
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
  "    --accent: #8fb3f0; --accent-fg: #11151f; --accent-soft: #1f2d4a; --up: #52c999; --down: #ff8080;",
  "    --warn-bg: #3a2f14; --warn-fg: #f3d58a;",
  "    --t1-bg: #3a3112; --t1-fg: #f6dc85; --t2-bg: #163527; --t2-fg: #8fdcb5; --t3-bg: #172c48; --t3-fg: #9cc6f6;",
  "    --t4-bg: #2c2042; --t4-fg: #ccb2f2; --t5-bg: #252b38; --t5-fg: #b6bdcc; --tu-bg: #1d2331; --tu-fg: #9aa5bd;",
  "    --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 4px 16px rgba(0, 0, 0, .25);",
  "    color-scheme: dark;",
  "  }",
  "}",
  ":root[data-theme=\"dark\"] {",
  "  --bg: #11151f; --surface: #1a2030; --surface-2: #222a3d; --fg: #e7ebf3; --muted: #9aa5bd; --line: #2e3850;",
  "  --accent: #8fb3f0; --accent-fg: #11151f; --accent-soft: #1f2d4a; --up: #52c999; --down: #ff8080;",
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
  ".ph-4 { --c: #e6b800; } .ph-3 { --c: #34a853; } .ph-3c { --c: #f2994a; } .ph-2 { --c: #c2185b; } .ph-1 { --c: #5b7fbf; } .ph-x { --c: #9aa5bd; } .ph-u { --c: #c6ccd8; }",
  ".board { grid-template-columns: repeat(7, minmax(180px, 1fr)); }",
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
  ".form select { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 8px 10px; font-size: 13px; width: 100%; }",
  ".filters label.meta { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }",
  ".conf { font-size: 11px; padding: 1px 6px; border-radius: 6px; background: var(--surface-2); color: var(--muted); }",
  ".ai-note { font-size: 12px; color: var(--muted); line-height: 1.6; }",
  "a.ext { color: var(--accent); word-break: break-all; }",
  "</style>",
  "",
  "<div class=\"wrap\">",
  "  <header class=\"top\">",
  "    <div class=\"title\">",
  "      <h1>SNSフェーズ判定 <small>TikTok</small></h1>",
  "      <p>TikTokのアカウントURLを登録すると、AI（Gemini）が直近30日の投稿数・平均再生を調べ、SNS_フェーズ表と同じ基準でフェーズ分けします。</p>",
  "    </div>",
  "    <div class=\"actions\">",
  "      <div class=\"views\" role=\"tablist\" aria-label=\"表示\">",
  "        <button class=\"view-btn\" id=\"v-board\" type=\"button\" aria-selected=\"true\">フェーズ</button>",
  "        <button class=\"view-btn\" id=\"v-trend\" type=\"button\" aria-selected=\"false\">推移</button>",
  "      </div>",
  "      <button class=\"btn\" id=\"btn-export\" type=\"button\" disabled>CSV書き出し</button>",
  "      <button class=\"btn primary\" id=\"btn-add\" type=\"button\">アカウントを追加</button>",
  "    </div>",
  "  </header>",
  "",
  "  <div class=\"notice\" id=\"notice\" hidden></div>",
  "",
  "  <main id=\"main\">",
  "    <section class=\"empty\" id=\"empty\">",
  "      <h2 id=\"empty-title\">データを読み込んでいます…</h2>",
  "      <p id=\"empty-text\">登録したアカウントが、フェーズごとに並びます。</p>",
  "    </section>",
  "",
  "    <div id=\"board-view\" hidden style=\"display:grid;gap:14px\">",
  "      <section class=\"strip\" id=\"strip\" aria-label=\"フェーズ別の人数\" style=\"grid-template-columns:repeat(4,minmax(0,1fr))\"></section>",
  "      <div class=\"filters\">",
  "        <input id=\"q\" type=\"search\" placeholder=\"名前・URLで探す\" aria-label=\"名前・URLで探す\">",
  "        <select id=\"f-owner\" aria-label=\"担当者\"><option value=\"\">担当者：すべて</option></select>",
  "        <span class=\"spacer\"></span>",
  "        <span class=\"meta\" id=\"meta\"></span>",
  "      </div>",
  "      <section class=\"board\" id=\"board\" aria-label=\"フェーズ別メンバー\"></section>",
  "    </div>",
  "",
  "    <div id=\"trend-view\" hidden style=\"display:grid;gap:14px\">",
  "      <section class=\"table-card\"><h3>月別のフェーズ人数（判定履歴）</h3><div class=\"table-scroll\" id=\"trend-table\"></div></section>",
  "      <section class=\"table-card\"><h3>担当者別（現在）</h3><div class=\"table-scroll\" id=\"owner-table\"></div></section>",
  "    </div>",
  "  </main>",
  "",
  "  <footer class=\"footer\">",
  "    <p id=\"criteria-line\"></p>",
  "    <p>フェーズはAIが調べた数字（手入力があればそちらを優先）から決めます。前月＝判定履歴の前月のフェーズ。<a id=\"sheet-link\" href=\"#\" target=\"_blank\" rel=\"noopener\" hidden>スプレッドシートを開く</a></p>",
  "  </footer>",
  "</div>",
  "",
  "<div class=\"scrim\" id=\"scrim\" hidden></div>",
  "<aside class=\"drawer\" id=\"drawer\" hidden aria-label=\"アカウントの詳細\"></aside>",
  "",
  "<div class=\"modal\" id=\"add-modal\" hidden>",
  "  <div class=\"dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"add-title\">",
  "    <h2 id=\"add-title\">アカウントを追加</h2>",
  "    <p>TikTokのURL（https://www.tiktok.com/@ユーザー名）を入れてください。「追加してAIで調べる」を押すと、そのままフェーズを判定します（10〜20秒）。</p>",
  "    <form class=\"form\" id=\"add-form\">",
  "      <div class=\"grid2\">",
  "        <label>名前<input id=\"a-name\" required></label>",
  "        <label>担当者<input id=\"a-owner\"></label>",
  "      </div>",
  "      <label>TikTokのURL<input id=\"a-tiktok\" required placeholder=\"https://www.tiktok.com/@...\"></label>",
  "      <label>InstagramのURL（任意）<input id=\"a-insta\" placeholder=\"https://www.instagram.com/...\"></label>",
  "      <div class=\"dialog-actions\">",
  "        <span class=\"saved\" id=\"add-msg\"></span>",
  "        <button class=\"btn\" id=\"add-close\" type=\"button\">閉じる</button>",
  "        <button class=\"btn primary\" id=\"add-go\" type=\"submit\">追加してAIで調べる</button>",
  "      </div>",
  "    </form>",
  "  </div>",
  "</div>",
  "",
  "<script>",
  "(function () {",
  "  'use strict';",
  "  /*__TK_SHARED__*/",
  "",
  "  const CLS = { フェーズ4: 'ph-4', フェーズ3: 'ph-3', フェーズ3候補: 'ph-3c', フェーズ2: 'ph-2', フェーズ1: 'ph-1', フェーズ外: 'ph-x', 未判定: 'ph-u' };",
  "  const state = { rows: [], prev: {}, history: [], cfg: null, month: null, hasKey: true, list: [], view: 'board', open: null, loaded: false };",
  "  try { const v = localStorage.getItem('tk-view'); if (v) state.view = v; } catch (e) {}",
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
  "  const num = (n) => (n === null || n === '' || n === undefined ? '—' : Math.round(n).toLocaleString('ja-JP'));",
  "  const errText = (e) => (e && e.message) || String(e);",
  "  const showNotice = (msg) => { $('notice').textContent = msg || ''; $('notice').hidden = !msg; };",
  "  const gs = (fn, ...args) => new Promise((ok, ng) => google.script.run.withSuccessHandler(ok).withFailureHandler(ng)[fn](...args));",
  "",
  "  function build() {",
  "    state.list = state.rows.map((r) => {",
  "      const j = tkJudge(r, state.cfg);",
  "      const prev = state.prev[tkNormalizeUrl(r.tiktok)] || '';",
  "      return Object.assign({}, r, j, { prevPhase: prev, change: tkChange(j.phase, prev) });",
  "    });",
  "  }",
  "",
  "  function render() {",
  "    const c = state.cfg || { p4: 200000, p3: 100000, weekly: 3 };",
  "    $('criteria-line').textContent = '基準：フェーズ4＝平均再生' + c.p4 / 10000 + '万回以上、フェーズ3＝' + c.p3 / 10000 + '万回以上 or 有償案件＋本部長承認、フェーズ2＝週' + c.weekly + '本以上投稿、フェーズ1＝週' + c.weekly + '本未満';",
  "    $('v-board').setAttribute('aria-selected', String(state.view === 'board'));",
  "    $('v-trend').setAttribute('aria-selected', String(state.view === 'trend'));",
  "    if (state.loaded && !state.hasKey) showNotice('Gemini APIキーが未設定です。スプレッドシートのメニュー「TikTokフェーズ → Gemini APIキーを設定」で入れてください。');",
  "    if (!state.rows.length) {",
  "      $('board-view').hidden = true; $('trend-view').hidden = true; $('empty').hidden = false; $('btn-export').disabled = true;",
  "      $('empty-title').textContent = state.loaded ? 'まだアカウントがありません' : 'データを読み込んでいます…';",
  "      $('empty-text').textContent = state.loaded ? '右上の「アカウントを追加」からTikTokのURLを登録してください。' : '登録したアカウントが、フェーズごとに並びます。';",
  "      return;",
  "    }",
  "    build();",
  "    $('empty').hidden = true; $('btn-export').disabled = false;",
  "    $('board-view').hidden = state.view !== 'board';",
  "    $('trend-view').hidden = state.view !== 'trend';",
  "    if (state.view === 'board') { renderStrip(); renderFilters(); renderBoard(); } else renderTrend();",
  "    if (state.open) renderDrawer();",
  "  }",
  "",
  "  function renderStrip() {",
  "    const count = {}, prevCount = {};",
  "    state.list.forEach((x) => (count[x.phase] = (count[x.phase] || 0) + 1));",
  "    Object.values(state.prev).forEach((t) => (prevCount[t] = (prevCount[t] || 0) + 1));",
  "    const hasPrev = Object.keys(state.prev).length > 0;",
  "    const targets = state.cfg.targets || {};",
  "    const cells = ['フェーズ4', 'フェーズ3', 'フェーズ2', 'フェーズ1'].map((t) => {",
  "      const n = (count[t] || 0) + (t === 'フェーズ3' ? count['フェーズ3候補'] || 0 : 0);",
  "      const p = (prevCount[t] || 0) + (t === 'フェーズ3' ? prevCount['フェーズ3候補'] || 0 : 0);",
  "      const d = n - p;",
  "      return el('div', { class: 'cell ' + CLS[t] }, [",
  "        el('span', { class: 'lbl' }, [el('span', { class: 'dot', style: 'background:var(--c)' }), t + '（' + TK_PHASE_LABEL[t] + '）']),",
  "        el('span', { class: 'val' }, [String(n), el('small', { text: '人' })]),",
  "        el('span', { class: 'delta' }, hasPrev ? ['前月 ' + p + '人 ', el('span', { class: d > 0 ? 'up' : d < 0 ? 'down' : '', text: d === 0 ? '±0' : (d > 0 ? '+' : '') + d })] : ['前月 —']),",
  "        t === 'フェーズ3' && count['フェーズ3候補'] ? el('span', { class: 'target', text: 'うち承認待ち ' + count['フェーズ3候補'] + '人' }) : null,",
  "        targets[t] ? el('span', { class: 'target', text: '目標 ' + targets[t] + '人' + (n >= targets[t] ? '（達成）' : '（あと' + (targets[t] - n) + '人）') }) : null,",
  "      ]);",
  "    });",
  "    $('strip').replaceChildren(...cells);",
  "  }",
  "",
  "  function renderFilters() {",
  "    const sel = $('f-owner');",
  "    const cur = sel.value;",
  "    const owners = Array.from(new Set(state.list.map((x) => String(x.owner || '').trim()).filter(Boolean))).sort();",
  "    sel.replaceChildren(el('option', { value: '', text: '担当者：すべて' }), ...owners.map((o) => el('option', { value: o, text: o })));",
  "    sel.value = owners.indexOf(cur) >= 0 ? cur : '';",
  "  }",
  "",
  "  function renderBoard() {",
  "    const q = $('q').value.trim().toLowerCase(), o = $('f-owner').value;",
  "    const list = state.list.filter((x) => (!q || String(x.name).toLowerCase().includes(q) || String(x.tiktok).toLowerCase().includes(q)) && (!o || String(x.owner).trim() === o));",
  "    $('meta').textContent = list.length + '人 / ' + state.list.length + '人';",
  "    $('board').replaceChildren(...TK_PHASES.map((t) => {",
  "      const people = list.filter((x) => x.phase === t).sort((a, b) => (b.avg || 0) - (a.avg || 0));",
  "      return el('section', { class: 'col ' + CLS[t] }, [",
  "        el('div', { class: 'col-head' }, [el('h2', { text: t }), el('span', { class: 'count', text: people.length + '人' })]),",
  "        el('div', { class: 'col-desc', text: TK_PHASE_LABEL[t] }),",
  "        people.length ? el('ul', { class: 'list' }, people.map((x, i) => el('li', {}, [el('button', { class: 'person', type: 'button', onclick: () => { state.open = x.row; renderDrawer(); } }, [",
  "          el('span', { class: 'no', text: String(i + 1) }),",
  "          el('span', { class: 'nm', text: x.name || x.tiktok, title: x.name }),",
  "          el('span', { class: 'sales', text: (x.avg !== null ? '平均' + num(x.avg) + '回' : '再生—') + '・' + (x.weekly !== null ? '週' + x.weekly + '本' : '投稿—') + (x.owner ? '・' + x.owner : '') }),",
  "          x.change === '昇格' ? el('span', { class: 'chip up', text: x.prevPhase + '→' }) : x.change === '降格' ? el('span', { class: 'chip down', text: x.prevPhase + '→' }) : el('span'),",
  "        ])]))) : el('div', { class: 'empty-col', text: '該当者なし' }),",
  "      ]);",
  "    }));",
  "  }",
  "",
  "  function table(head, rows) {",
  "    return el('table', { class: 'data' }, [el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]),",
  "      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v) => el('td', { text: String(v) })))))]);",
  "  }",
  "  function renderTrend() {",
  "    const months = Array.from(new Set(state.history.map((h) => h[0]))).sort((a, b) => a - b);",
  "    $('trend-table').replaceChildren(months.length ? table(['月'].concat(TK_PHASES, ['合計']), months.map((m) => {",
  "      const hs = state.history.filter((h) => h[0] === m);",
  "      return [tkMonthLabel(m) + (m === state.month ? '（今月）' : '')].concat(TK_PHASES.map((t) => hs.filter((h) => h[2] === t).length), [hs.length]);",
  "    })) : el('p', { class: 'meta', text: 'AIで調べると、月ごとに記録されます。' }));",
  "    const owners = Array.from(new Set(state.list.map((x) => String(x.owner || '').trim() || '（未設定）')));",
  "    $('owner-table').replaceChildren(table(['担当者'].concat(TK_PHASES, ['合計']), owners.map((o) => {",
  "      const mine = state.list.filter((x) => (String(x.owner || '').trim() || '（未設定）') === o);",
  "      return [o].concat(TK_PHASES.map((t) => mine.filter((x) => x.phase === t).length), [mine.length]);",
  "    })));",
  "  }",
  "",
  "  // ===== 詳細 =====",
  "  function closeDrawer() { state.open = null; $('drawer').hidden = true; $('scrim').hidden = true; }",
  "  function renderDrawer() {",
  "    const x = state.list.find((p) => p.row === state.open);",
  "    if (!x) { closeDrawer(); return; }",
  "    const kv = (k, v) => el('div', {}, [el('dt', { text: k }), el('dd', { text: v })]);",
  "    const sel = (opts, v) => { const s = el('select', {}, opts.map((o) => el('option', { value: o, text: o || '（空欄）' }))); s.value = v || ''; return s; };",
  "    const f = {",
  "      name: el('input', { value: x.name || '' }), owner: el('input', { value: x.owner || '' }), tiktok: el('input', { value: x.tiktok || '' }), insta: el('input', { value: x.insta || '' }),",
  "      paid: sel(['', '○'], x.paid), approve: sel(['', '○'], x.approve), excluded: sel(['', '○'], x.excluded),",
  "      avgManual: el('input', { type: 'number', min: '0', value: x.avgManual === '' ? '' : x.avgManual, placeholder: 'AIの値を使う' }),",
  "      postsManual: el('input', { type: 'number', min: '0', value: x.postsManual === '' ? '' : x.postsManual, placeholder: 'AIの値を使う' }),",
  "      memo: el('textarea'),",
  "    };",
  "    f.memo.value = x.memo || '';",
  "    const msg = el('span', { class: 'saved' });",
  "    const save = el('button', { class: 'btn primary', type: 'submit', text: '保存' });",
  "    const aiBtn = el('button', { class: 'btn', type: 'button', text: 'AIで調べ直す' });",
  "    aiBtn.addEventListener('click', async () => {",
  "      aiBtn.disabled = true; aiBtn.textContent = '調べています…（10〜20秒）';",
  "      try { await gs('tkWebJudge', x.row, x.tiktok); await reload(); } catch (e) { showNotice('調べられませんでした：' + errText(e)); }",
  "      aiBtn.disabled = false; aiBtn.textContent = 'AIで調べ直す';",
  "    });",
  "    const d = $('drawer');",
  "    d.className = 'drawer ' + CLS[x.phase];",
  "    d.replaceChildren(",
  "      el('div', { class: 'drawer-head' }, [",
  "        el('div', { class: 'row' }, [el('h2', { text: x.name || x.tiktok }), el('button', { class: 'x', type: 'button', 'aria-label': '閉じる', onclick: closeDrawer, text: '×' })]),",
  "        el('div', { class: 'sub' }, [el('span', { class: 'badge', text: x.phase }), '　' + (x.prevPhase ? '前月 ' + x.prevPhase : '前月の記録なし') + (x.owner ? '・担当 ' + x.owner : '')]),",
  "      ]),",
  "      el('div', { class: 'drawer-body' }, [",
  "        el('div', { class: 'reason' }, [el('b', { text: '判定理由' }), x.reason, el('b', { text: '次のフェーズまで' }), x.next]),",
  "        el('dl', { class: 'kv' }, [kv('平均再生（判定に使用）', num(x.avg) + '回'), kv('週あたり投稿', x.weekly === null ? '—' : x.weekly + '本'),",
  "          kv('平均再生（AI）', num(x.avgAi === '' ? null : x.avgAi) + '回'), kv('投稿数／30日（AI）', x.postsAi === '' ? '—' : x.postsAi + '本'),",
  "          kv('フォロワー', num(x.followers === '' ? null : x.followers)), kv('いいね総数', num(x.likes === '' ? null : x.likes)),",
  "          kv('最終投稿日', x.lastPost || '—'), kv('最終取得', x.fetchedAt || '—')]),",
  "        el('div', { class: 'ai-note' }, [el('span', { class: 'conf', text: 'AIの確度 ' + (x.confidence || '—') }), '　' + (x.aiNote || 'まだAIで調べていません'), x.status && String(x.status).indexOf('OK') !== 0 ? el('div', { text: x.status, style: 'color:var(--down)' }) : null]),",
  "        el('div', { class: 'dialog-actions' }, [el('a', { class: 'ext', href: tkNormalizeUrl(x.tiktok), target: '_blank', rel: 'noopener', text: 'TikTokを開く' }), aiBtn]),",
  "        el('div', { class: 'section-title', text: '手入力（スプレッドシートに保存）' }),",
  "        el('form', { class: 'form', onsubmit: async (e) => {",
  "          e.preventDefault();",
  "          save.disabled = true; msg.style.color = ''; msg.textContent = '保存中…';",
  "          const body = {}; Object.keys(f).forEach((k) => (body[k] = f[k].value.trim ? f[k].value.trim() : f[k].value));",
  "          try { await gs('tkWebSave', x.row, x.tiktok, body); await reload(); msg.textContent = '保存しました'; }",
  "          catch (err) { msg.style.color = 'var(--down)'; msg.textContent = '保存できませんでした：' + errText(err); }",
  "          finally { save.disabled = false; }",
  "        } }, [",
  "          el('div', { class: 'grid2' }, [el('label', {}, ['名前', f.name]), el('label', {}, ['担当者', f.owner])]),",
  "          el('label', {}, ['TikTokのURL', f.tiktok]), el('label', {}, ['InstagramのURL（任意）', f.insta]),",
  "          el('div', { class: 'grid2' }, [el('label', {}, ['有償案件（獲得済み）', f.paid]), el('label', {}, ['本部長承認', f.approve]),",
  "            el('label', {}, ['フェーズ外（LTV枠）', f.excluded]), el('span'),",
  "            el('label', {}, ['平均再生（手入力・優先）', f.avgManual]), el('label', {}, ['投稿数／30日（手入力・優先）', f.postsManual])]),",
  "          el('label', {}, ['メモ', f.memo]),",
  "          el('div', { class: 'dialog-actions' }, [msg, save]),",
  "        ]),",
  "      ]),",
  "    );",
  "    d.hidden = false; $('scrim').hidden = false;",
  "  }",
  "",
  "  // ===== 追加・書き出し =====",
  "  async function addAccount(e) {",
  "    e.preventDefault();",
  "    const body = { name: $('a-name').value.trim(), owner: $('a-owner').value.trim(), tiktok: $('a-tiktok').value.trim(), insta: $('a-insta').value.trim() };",
  "    $('add-go').disabled = true; $('add-msg').style.color = ''; $('add-msg').textContent = '追加しています…';",
  "    try {",
  "      const row = await gs('tkWebAdd', body);",
  "      $('add-msg').textContent = 'AIで調べています…（10〜20秒）';",
  "      try { await gs('tkWebJudge', row, tkNormalizeUrl(body.tiktok)); } catch (err) { showNotice('追加しましたが、AIで調べられませんでした：' + errText(err)); }",
  "      await reload();",
  "      $('add-modal').hidden = true; $('add-form').reset(); state.open = row; renderDrawer();",
  "    } catch (err) { $('add-msg').style.color = 'var(--down)'; $('add-msg').textContent = errText(err); }",
  "    $('add-go').disabled = false;",
  "  }",
  "  function exportCsv() {",
  "    const head = ['名前', '担当者', 'TikTok URL', 'フェーズ', '前月', '変化', '平均再生', '週あたり投稿', 'フォロワー', '判定理由', '次のフェーズまで', 'AIの確度', 'メモ'];",
  "    const q = (v) => { const s = String(v == null ? '' : v); return /[\",\\n]/.test(s) ? '\"' + s.replace(/\"/g, '\"\"') + '\"' : s; };",
  "    const lines = [head.join(',')].concat(state.list.map((x) => [x.name, x.owner, x.tiktok, x.phase, x.prevPhase, x.change, x.avg === null ? '' : Math.round(x.avg), x.weekly === null ? '' : x.weekly, x.followers, x.reason, x.next, x.confidence, x.memo].map(q).join(',')));",
  "    const a = el('a', { href: URL.createObjectURL(new Blob(['\\uFEFF' + lines.join('\\r\\n')], { type: 'text/csv' })), download: 'TikTok_フェーズ.csv' });",
  "    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);",
  "  }",
  "",
  "  async function reload() {",
  "    const data = await gs('tkWebLoad');",
  "    Object.assign(state, { rows: data.rows || [], prev: data.prev || {}, history: data.history || [], cfg: data.cfg, month: data.month, hasKey: data.hasKey, loaded: true });",
  "    if (data.url) { $('sheet-link').href = data.url; $('sheet-link').hidden = false; }",
  "    render();",
  "  }",
  "",
  "  $('v-board').addEventListener('click', () => { state.view = 'board'; try { localStorage.setItem('tk-view', 'board'); } catch (e) {} render(); });",
  "  $('v-trend').addEventListener('click', () => { state.view = 'trend'; try { localStorage.setItem('tk-view', 'trend'); } catch (e) {} render(); });",
  "  ['q', 'f-owner'].forEach((id) => $(id).addEventListener(id === 'q' ? 'input' : 'change', () => state.list.length && renderBoard()));",
  "  $('btn-add').addEventListener('click', () => { $('add-msg').textContent = ''; $('add-modal').hidden = false; });",
  "  $('add-close').addEventListener('click', () => ($('add-modal').hidden = true));",
  "  $('add-form').addEventListener('submit', addAccount);",
  "  $('btn-export').addEventListener('click', exportCsv);",
  "  $('scrim').addEventListener('click', closeDrawer);",
  "  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('add-modal').hidden = true; closeDrawer(); } });",
  "",
  "  render();",
  "  reload().catch((e) => { state.loaded = true; showNotice('スプレッドシートを読み込めませんでした：' + errText(e) + '。ページを再読み込みしてください。'); render(); });",
  "})();",
  "</script>",
].join('\n');
// </APP_HTML>
