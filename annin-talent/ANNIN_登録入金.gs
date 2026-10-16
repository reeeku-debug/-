// ANNIN タレント管理：新規登録・入金チェックアプリ
//
// スプレッドシート「ANNIN_タレント管理シート（kintone移行版）」に貼り付けて使う Apps Script です。
//
//   ① 新規登録：アプリに入力すると、次の3シートに1行ずつ自動で追加する
//        - 10_タレント台帳      … ANNIN No.・姓・名・姓（カナ）・名（カナ）・性別・開始年月・所属事務所
//        - 20_受領管理          … ANNIN No.・姓名・所属事務所・開始年月（月の列はチェックなし）
//        - 30_個人情報（銀行口座）… 郵便番号・住所・電話番号・銀行名・支店名・区分・口座名義・口座番号
//      ANNIN No. は3シートの最大の番号＋1を自動で振る（手入力した番号が使用済みなら登録しない）
//   ② 入金チェック：ANNIN No. か名前（カナも可）で探して、その月の［受］にチェックを付ける
//        - ANNIN No. をまとめて貼り付けて一括チェックもできる
//   ③ 入金ダッシュボード：今月（または選んだ月）の入金数・未入金数・入金率・事務所別・未入金者一覧・月別推移
//
// 数式が入っている列（入金月数・最終入金月・ステータスなど）は、1つ上の行の数式をそのまま引き継ぐ。
// セットアップ手順は同じフォルダの README.md を参照してください。

// ===== 設定 ===============================================================

const SHEET = {
  ledger: '10_タレント台帳',
  payment: '20_受領管理',
  personal: '30_個人情報（銀行口座）',
};

/** アプリで選べる所属事務所 */
const OFFICES = ['東京', '大阪'];

/** アプリで選べる性別（任意項目） */
const GENDERS = ['男', '女', 'ジェンダーレス'];

/** アプリで選べる口座区分 */
const ACCOUNT_TYPES = ['普通口座', '当座口座'];

/** 列の見出し（左から順に探す。空白・全角半角の違いは無視） */
const COLS = {
  no: ['ANNIN No.', 'ANNINNo', 'ANNIN NO', 'No.'],
  lastName: ['姓'],
  firstName: ['名'],
  lastKana: ['姓（カナ）', '姓(カナ)', 'セイ'],
  firstKana: ['名（カナ）', '名(カナ)', 'メイ'],
  gender: ['性別'],
  start: ['開始年月', '開始月'],
  office: ['所属事務所', '所属'],
  paidCount: ['入金月数'],
  lastPaid: ['最終入金月'],
  bank: ['銀行情報登録'],
  cancel: ['解約'],
  status: ['ステータス'],
  fullName: ['姓名', '氏名'],
  zip: ['郵便番号'],
  address: ['住所'],
  phone: ['電話番号'],
  bankName: ['銀行名'],
  branch: ['支店名'],
  accountType: ['区分', '口座区分'],
  holder: ['口座名義'],
  accountNo: ['口座番号'],
};

// ===== 画面 ===============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ANNIN管理')
    .addItem('登録・入金アプリを開く', 'openAppDialog')
    .addItem('入金ダッシュボードを作成・更新', 'buildPaymentDashboard')
    .addToUi();
}

function openAppDialog() {
  const html = HtmlService.createHtmlOutput(APP_HTML_).setWidth(720).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'ANNIN 登録・入金チェック');
}

/** ウェブアプリ（スマホから使う場合）。デプロイ時のアクセスは「自分のみ」か組織内に限定すること */
function doGet() {
  return HtmlService.createHtmlOutput(APP_HTML_)
    .setTitle('ANNIN 登録・入金チェック')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===== アプリから呼ばれる関数（google.script.run） =========================

/** 画面の初期表示に使うデータ */
function getInitData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const months = monthColumns_(readTable_(sheet_(ss, SHEET.payment))).map(function (m) { return m.ym; });
  return {
    nextNo: nextAnninNo_(ss),
    months: months,
    currentMonth: currentYm_(),
    offices: OFFICES,
    genders: GENDERS,
    accountTypes: ACCOUNT_TYPES,
  };
}

/**
 * 新規登録。form は画面の入力値。
 * 同じ姓名の人がすでにいて force が false のときは登録せずに { duplicates } を返す（画面で確認する）。
 */
function registerTalent(form) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const f = cleanForm_(form || {});
  return withLock_(function () {
    const used = usedAnninNos_(ss);
    let no;
    if (f.no !== '') {
      no = Number(f.no);
      if (used[no]) throw new Error('ANNIN No. ' + no + ' はすでに使われています（次の空き番号：' + nextAnninNo_(ss) + '）');
    } else {
      no = nextAnninNo_(ss);
    }

    if (!form.force) {
      const dups = findByFullName_(ss, f.lastName + f.firstName);
      if (dups.length) return { ok: false, duplicates: dups };
    }

    const fullName = f.lastName + ' ' + f.firstName;
    const hasBank = f.bankName !== '' && f.accountNo !== '';

    appendRecord_(sheet_(ss, SHEET.ledger), {
      no: no, lastName: f.lastName, firstName: f.firstName, lastKana: f.lastKana, firstKana: f.firstKana,
      gender: f.gender, start: f.start, office: f.office,
      bank: hasBank ? '済' : '未登録', cancel: false, paidCount: 0, lastPaid: '',
    });
    appendRecord_(sheet_(ss, SHEET.payment), {
      no: no, fullName: fullName, office: f.office, start: f.start, paidCount: 0, lastPaid: '',
    }, { uncheckMonths: true });
    appendRecord_(sheet_(ss, SHEET.personal), {
      no: no, fullName: fullName, zip: f.zip, address: f.address, phone: f.phone,
      bankName: f.bankName, branch: f.branch, accountType: f.accountType, holder: f.holder, accountNo: f.accountNo,
    });
    ensureCalcRows_(ss);
    SpreadsheetApp.flush();
    return { ok: true, no: no, fullName: fullName, nextNo: nextAnninNo_(ss) };
  });
}

/** ANNIN No.（完全一致）か名前・カナ（部分一致）で探し、指定月の入金状況をつけて返す */
function searchTalents(query, month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const q = normText_(query);
  if (!q) return [];
  const ym = normYm_(month);
  const ledger = readTable_(sheet_(ss, SHEET.ledger));
  const pay = readTable_(sheet_(ss, SHEET.payment));
  const payRows = rowsByNo_(pay);
  const monthCol = findMonthCol_(pay, ym);
  const isNo = /^\d+$/.test(q);

  const L = function (row, key) { return cell_(ledger, row, key); };
  const out = [];
  ledger.rows.forEach(function (row) {
    const no = toNo_(L(row, 'no'));
    if (no === null) return;
    const name = String(L(row, 'lastName')) + ' ' + String(L(row, 'firstName'));
    const kana = String(L(row, 'lastKana')) + ' ' + String(L(row, 'firstKana'));
    const hit = isNo ? String(no) === q : normText_(name).indexOf(q) >= 0 || normText_(kana).indexOf(q) >= 0;
    if (!hit) return;
    const p = payRows[no];
    out.push({
      no: no,
      name: name.trim(),
      kana: kana.trim(),
      office: String(L(row, 'office')),
      start: normYm_(L(row, 'start')),
      status: String(L(row, 'status')),
      paid: p && monthCol ? p.values[monthCol.index] === true : false,
      inPayment: !!p,
      paidCount: p ? countPaid_(pay, p.values) : 0,
    });
  });
  return out.slice(0, 50);
}

/** 1人の指定月の［受］チェックを付ける／外す */
function setPayment(no, month, paid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return withLock_(function () {
    const res = setPayments_(ss, [no], month, paid !== false);
    if (res.notFound.length) throw new Error('20_受領管理 に ANNIN No. ' + no + ' が見つかりません');
    return res;
  });
}

/** ANNIN No. をまとめてチェック（改行・カンマ・空白区切りの文字列） */
function setPaymentsBulk(text, month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nos = parseNoList_(text);
  if (!nos.length) throw new Error('ANNIN No. を入力してください');
  return withLock_(function () { return setPayments_(ss, nos, month, true); });
}

// ===== 中身 ===============================================================

function setPayments_(ss, nos, month, paid) {
  const ym = normYm_(month);
  if (!ym) throw new Error('対象月を選んでください');
  const sh = sheet_(ss, SHEET.payment);
  const pay = readTable_(sh);
  const col = findMonthCol_(pay, ym);
  if (!col) throw new Error('20_受領管理 に「' + ym + '」の列がありません。先にシートに月の列を追加してください');
  const byNo = rowsByNo_(pay);
  const ledgerSheet = sheet_(ss, SHEET.ledger);
  const ledger = readTable_(ledgerSheet);
  const ledgerByNo = rowsByNo_(ledger);

  const done = [];
  const already = [];
  const notFound = [];
  nos.forEach(function (n) {
    const no = toNo_(n);
    const p = no === null ? null : byNo[no];
    if (!p) { notFound.push(String(n)); return; }
    if ((p.values[col.index] === true) === paid) { already.push(no); return; }
    sh.getRange(p.rowNumber, col.index + 1).setValue(paid);
    p.values[col.index] = paid;
    refreshPaidSummary_(sh, pay, p, ledgerSheet, ledger, ledgerByNo[no]);
    done.push(no);
  });
  return { ok: true, month: ym, paid: paid, done: done, already: already, notFound: notFound };
}

/** 入金月数・最終入金月が数式でない列なら、値を計算して書き直す（数式ならシートに任せる） */
function refreshPaidSummary_(paySheet, pay, p, ledgerSheet, ledger, lr) {
  const count = countPaid_(pay, p.values);
  const last = lastPaid_(pay, p.values);
  writeIfNotFormula_(paySheet, pay, p.rowNumber, 'paidCount', count);
  writeIfNotFormula_(paySheet, pay, p.rowNumber, 'lastPaid', last, true);
  if (lr) {
    writeIfNotFormula_(ledgerSheet, ledger, lr.rowNumber, 'paidCount', count);
    writeIfNotFormula_(ledgerSheet, ledger, lr.rowNumber, 'lastPaid', last, true);
  }
}

function writeIfNotFormula_(sh, table, rowNumber, key, value, asText) {
  const idx = table.col[key];
  if (idx === undefined) return;
  const range = sh.getRange(rowNumber, idx + 1);
  if (range.getFormula()) return;
  if (asText) range.setNumberFormat('@');
  range.setValue(value);
}

function countPaid_(pay, values) {
  return monthColumns_(pay).filter(function (m) { return values[m.index] === true; }).length;
}

function lastPaid_(pay, values) {
  const paid = monthColumns_(pay).filter(function (m) { return values[m.index] === true; });
  return paid.length ? paid[paid.length - 1].ym : '';
}

/**
 * データの最終行の下に1行追加する。
 * - data のキーに対応する列には値を書く
 * - それ以外で、1つ上の行が数式の列は数式を引き継ぐ（R1C1 でコピーするので行番号がずれない）
 * - 書式・入力規則（チェックボックス・プルダウン）も1つ上の行からコピーする
 * - opts.uncheckMonths：月の列（YYYY/MM）はチェックなし（FALSE）にする
 */
function appendRecord_(sh, data, opts) {
  opts = opts || {};
  const t = readTable_(sh);
  const width = t.headers.length;
  const lastData = t.rows.length ? t.rows[t.rows.length - 1] : null;
  const target = lastData ? lastData.rowNumber + 1 : t.headerRow + 1;
  if (target > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);

  const targetRange = sh.getRange(target, 1, 1, width);
  let templateFormulas = null;
  let templateValues = null;
  if (lastData) {
    const tpl = sh.getRange(lastData.rowNumber, 1, 1, width);
    tpl.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    tpl.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    templateFormulas = tpl.getFormulasR1C1()[0];
    templateValues = lastData.values;
  }

  const monthIdx = {};
  if (opts.uncheckMonths) monthColumns_(t).forEach(function (m) { monthIdx[m.index] = true; });
  const byIdx = {};
  Object.keys(data).forEach(function (key) {
    const idx = t.col[key];
    if (idx !== undefined) byIdx[idx] = data[key];
  });

  const line = [];
  const formulas = [];
  const textCols = [];
  for (let c = 0; c < width; c++) {
    const tplValue = templateValues ? templateValues[c] : '';
    if (templateFormulas && templateFormulas[c]) {
      formulas.push([c, templateFormulas[c]]);
      line.push('');
    } else if (monthIdx[c]) {
      line.push(false);
    } else if (Object.prototype.hasOwnProperty.call(byIdx, c)) {
      const v = byIdx[c];
      if (c === t.col.start && v !== '') {
        // 既存の開始年月が日付なら日付で、文字列なら文字列（"2026/10"）で書く
        if (isDate_(tplValue)) {
          const p = v.split('/');
          line.push(new Date(Number(p[0]), Number(p[1]) - 1, 1));
        } else {
          line.push(v);
          textCols.push(c);
        }
      } else {
        line.push(v);
        if (typeof v === 'string' && v !== '') textCols.push(c);
      }
    } else {
      line.push(typeof tplValue === 'boolean' ? false : '');
    }
  }
  // 口座番号・郵便番号の先頭0や "2026/10" が数値・日付に変換されないように、文字列の列は書式を「書式なしテキスト」にする
  textCols.forEach(function (c) {
    if (c !== t.col.no) sh.getRange(target, c + 1).setNumberFormat('@');
  });
  targetRange.setValues([line]);
  formulas.forEach(function (f) { sh.getRange(target, f[0] + 1).setFormulaR1C1(f[1]); });
  return target;
}

/** シートを読み、ANNIN No. の見出し行・列の位置・データ行を返す */
function readTable_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) throw new Error('「' + sh.getName() + '」が空です');
  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  let headerRow = -1;
  for (let r = 0; r < Math.min(values.length, 10); r++) {
    if (matchesAny_(values[r][0], COLS.no)) { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error('「' + sh.getName() + '」のA列に「ANNIN No.」の見出しが見つかりません');
  const headers = values[headerRow];
  const col = {};
  Object.keys(COLS).forEach(function (key) {
    for (let i = 0; i < COLS[key].length; i++) {
      const idx = headers.findIndex(function (h) { return normText_(h) === normText_(COLS[key][i]); });
      if (idx >= 0) { col[key] = idx; return; }
    }
  });
  const rows = [];
  for (let r = headerRow + 1; r < values.length; r++) {
    if (toNo_(values[r][0]) === null) continue;
    rows.push({ rowNumber: r + 1, values: values[r] });
  }
  return { headerRow: headerRow + 1, headers: headers, col: col, rows: rows };
}

function cell_(table, row, key) {
  const idx = table.col[key];
  const v = idx === undefined ? '' : row.values[idx];
  return v === null || v === undefined ? '' : v;
}

/** 見出しが YYYY/MM の列（受領管理の月の列） */
function monthColumns_(table) {
  const out = [];
  table.headers.forEach(function (h, i) {
    if (i === table.col.start) return;
    if (isDate_(h) || /^\s*\d{4}\s*[\/\-年.]\s*\d{1,2}\s*月?\s*$/.test(String(h))) {
      const ym = normYm_(h);
      if (ym) out.push({ ym: ym, index: i });
    }
  });
  return out;
}

function findMonthCol_(table, ym) {
  return monthColumns_(table).filter(function (m) { return m.ym === ym; })[0] || null;
}

function rowsByNo_(table) {
  const map = {};
  table.rows.forEach(function (row) {
    const no = toNo_(row.values[0]);
    if (no !== null && !map[no]) map[no] = row;
  });
  return map;
}

/** 3シートで使われている ANNIN No. */
function usedAnninNos_(ss) {
  const used = {};
  [SHEET.ledger, SHEET.payment, SHEET.personal].forEach(function (name) {
    readTable_(sheet_(ss, name)).rows.forEach(function (row) { used[toNo_(row.values[0])] = true; });
  });
  return used;
}

function nextAnninNo_(ss) {
  const nos = Object.keys(usedAnninNos_(ss)).map(Number);
  return (nos.length ? Math.max.apply(null, nos) : 0) + 1;
}

function findByFullName_(ss, name) {
  const key = normText_(name);
  const t = readTable_(sheet_(ss, SHEET.ledger));
  return t.rows
    .filter(function (row) { return normText_(String(cell_(t, row, 'lastName')) + String(cell_(t, row, 'firstName'))) === key; })
    .map(function (row) {
      return {
        no: toNo_(row.values[0]),
        name: (String(cell_(t, row, 'lastName')) + ' ' + String(cell_(t, row, 'firstName'))).trim(),
        office: String(cell_(t, row, 'office')),
        start: normYm_(cell_(t, row, 'start')),
        status: String(cell_(t, row, 'status')),
      };
    });
}

function cleanForm_(form) {
  const s = function (v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim(); };
  const f = {
    no: toHalf_(s(form.no)),
    lastName: s(form.lastName),
    firstName: s(form.firstName),
    lastKana: s(form.lastKana),
    firstKana: s(form.firstKana),
    gender: s(form.gender),
    office: s(form.office),
    start: normYm_(form.start),
    zip: toHalf_(s(form.zip)),
    address: s(form.address),
    phone: toHalf_(s(form.phone)),
    bankName: s(form.bankName),
    branch: s(form.branch),
    accountType: s(form.accountType),
    holder: s(form.holder),
    accountNo: toHalf_(s(form.accountNo)).replace(/[\s\-]/g, ''),
  };
  const errors = [];
  if (f.no !== '' && !/^\d+$/.test(f.no)) errors.push('ANNIN No. は数字で入力してください（空欄なら自動で振ります）');
  if (!f.lastName) errors.push('姓を入力してください');
  if (!f.firstName) errors.push('名を入力してください');
  if (!f.lastKana || !f.firstKana) errors.push('読み方（セイ・メイ）を入力してください');
  if (OFFICES.indexOf(f.office) < 0) errors.push('所属は「' + OFFICES.join('」か「') + '」を選んでください');
  if (!f.start) errors.push('開始月を選んでください');
  if (f.gender && GENDERS.indexOf(f.gender) < 0) errors.push('性別の値が正しくありません');
  if (f.accountType && ACCOUNT_TYPES.indexOf(f.accountType) < 0) errors.push('口座区分の値が正しくありません');
  if (f.accountNo && !/^\d+$/.test(f.accountNo)) errors.push('口座番号は数字で入力してください');
  if (errors.length) throw new Error(errors.join('\n'));
  // 読み方はカタカナにそろえる（ひらがなで入力されても OK）
  f.lastKana = toKatakana_(f.lastKana);
  f.firstKana = toKatakana_(f.firstKana);
  return f;
}

// ===== 入金ダッシュボード ===================================================
//
// メニュー「ANNIN管理 → 入金ダッシュボードを作成・更新」で、次の2シートを作る（何度実行しても安全）。
//   - 01_入金ダッシュボード … 対象月（空欄なら今月）の入金数・未入金数・入金率・事務所別・未入金者一覧・月別推移
//   - _入金集計（非表示）   … ダッシュボードの計算用。20_受領管理・10_タレント台帳を数式で参照する
// 中身はすべて数式なので、アプリやシートでチェックを付けるとすぐに反映される。

const DASH = {
  sheet: '01_入金ダッシュボード',
  calc: '_入金集計',
  fee: 30000, // 月謝の初期値（ダッシュボードのB5で変更できる）
};

function buildPaymentDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  withLock_(function () { buildPaymentDashboard_(ss); });
  ss.setActiveSheet(ss.getSheetByName(DASH.sheet));
  try { ss.toast('入金ダッシュボードを作成しました', 'ANNIN管理', 5); } catch (e) { /* toast は画面がないときは使えない */ }
}

function buildPaymentDashboard_(ss) {
  const paySheet = sheet_(ss, SHEET.payment);
  const pay = readTable_(paySheet);
  const ledger = readTable_(sheet_(ss, SHEET.ledger));
  ['start', 'office', 'fullName'].forEach(function (k) {
    if (pay.col[k] === undefined) throw new Error('20_受領管理 に「' + COLS[k][0] + '」の列が見つかりません');
  });
  if (!monthColumns_(pay).length) throw new Error('20_受領管理 に月の列（YYYY/MM）が見つかりません');

  // ---- 計算用シート ----
  const R = "'" + SHEET.payment + "'!";
  const L = "'" + SHEET.ledger + "'!";
  const first = pay.headerRow + 1;
  const lastLetter = colLetter_(pay.headers.length);
  const rng = function (key) { const c = colLetter_(pay.col[key] + 1); return R + c + first + ':' + c; };
  const noR = R + 'A' + first + ':A';
  const ifRow = function (expr) { return '=ARRAYFORMULA(IF(' + noR + '="",,' + expr + '))'; };
  const ymText = function (r) { return 'IF(ISNUMBER(' + r + '),TEXT(' + r + ',"yyyy/mm"),TRIM(TO_TEXT(' + r + ')))'; };
  const hdr = R + 'A' + pay.headerRow + ':' + lastLetter + pay.headerRow;
  const hdrNorm = 'ARRAYFORMULA(' + ymText(hdr) + ')';
  const body = R + 'A' + first + ':' + lastLetter;
  const cancel = ledger.col.cancel === undefined ? 'FALSE'
    : 'IFERROR(VLOOKUP(' + noR + ',' + L + 'A' + (ledger.headerRow + 1) + ':' + colLetter_(ledger.headers.length) + ',' + (ledger.col.cancel + 1) + ',FALSE)=TRUE,FALSE)';
  const D = "'" + DASH.sheet + "'!";
  // 最終入金月：シートの「最終入金月」列が空のことがあるので、月の列のチェックから直接求める（いちばん右の TRUE の月）
  const months = monthColumns_(pay);
  const mFirst = colLetter_(months[0].index + 1);
  const mLast = colLetter_(months[months.length - 1].index + 1);
  const mHdr = R + mFirst + pay.headerRow + ':' + mLast + pay.headerRow;
  const lastPaidFormula = '=BYROW(' + R + mFirst + first + ':' + mLast + ',LAMBDA(r,IF(COUNTIF(r,TRUE)=0,"",'
    + 'INDEX(ARRAYFORMULA(' + ymText(mHdr) + '),1,MAX(FILTER(SEQUENCE(1,COLUMNS(r)),r=TRUE))))))';

  // 2つのシートを先に用意する（お互いを数式で参照するため）
  let sh = ss.getSheetByName(DASH.sheet);
  const isNew = !sh;
  if (isNew) sh = ss.insertSheet(DASH.sheet, 1);
  let calc = ss.getSheetByName(DASH.calc);
  if (!calc) calc = ss.insertSheet(DASH.calc);
  calc.clear();
  const needRows = paySheet.getMaxRows() + 1000;
  if (calc.getMaxRows() < needRows) calc.insertRowsAfter(calc.getMaxRows(), needRows - calc.getMaxRows());
  calc.getRange(1, 1, 1, 10).setValues([['ANNIN No.', '姓名', '所属事務所', '開始年月', '入金月数', '最終入金月', '開始(数値)', '解約', '対象月入金', '前月入金']]);
  calc.getRange(2, 1, 1, 10).setFormulas([[
    ifRow(noR),
    ifRow(rng('fullName')),
    ifRow(rng('office')),
    ifRow(ymText(rng('start'))),
    pay.col.paidCount === undefined ? '' : ifRow(rng('paidCount')),
    lastPaidFormula,
    ifRow('IFERROR(VALUE(SUBSTITUTE(' + ymText(rng('start')) + ',"/","")),0)'),
    ifRow(cancel),
    ifRow('IF($M$5=0,FALSE,INDEX(' + body + ',0,MAX(1,$M$5))=TRUE)'),
    ifRow('IF($M$6=0,FALSE,INDEX(' + body + ',0,MAX(1,$M$6))=TRUE)'),
  ]]);
  calc.getRange('L1:M6').setValues([
    ['対象月', ''], ['対象月(数値)', ''], ['前月', ''], ['前月(数値)', ''], ['対象月の列番号', ''], ['前月の列番号', ''],
  ]);
  calc.getRange('M1:M6').setFormulas([
    ['=' + D + 'B4'],
    ['=VALUE(SUBSTITUTE(M1,"/",""))'],
    ['=TEXT(EDATE(DATE(LEFT(M1,4),RIGHT(M1,2),1),-1),"yyyy/mm")'],
    ['=VALUE(SUBSTITUTE(M3,"/",""))'],
    ['=IFERROR(MATCH(M1,' + hdrNorm + ',0),0)'],
    ['=IFERROR(MATCH(M3,' + hdrNorm + ',0),0)'],
  ]);
  calc.hideSheet();

  // ---- ダッシュボード ----
  let keepMonth = '';
  let keepFee = DASH.fee;
  if (!isNew) {
    keepMonth = sh.getRange('B3').getDisplayValue();
    const f = Number(sh.getRange('B5').getValue());
    if (f > 0) keepFee = f;
    sh.getCharts().forEach(function (c) { sh.removeChart(c); });
    sh.clear();
    sh.getRange('B3').clearDataValidations();
  }
  const C = "'" + DASH.calc + "'!";
  const col = function (letter) { return C + letter + '2:' + letter; };
  const target = 'COUNTIFS(' + col('A') + ',"<>",' + col('H') + ',FALSE,' + col('G') + ',"<="&' + C + '$M$2';
  const rate = function (paid, all) { return '=IF(' + all + '=0,"-",' + paid + '/' + all + ')'; };

  sh.getRange('A1').setValue('入金ダッシュボード').setFontSize(16).setFontWeight('bold');
  sh.getRange('A3:C5').setValues([
    ['対象月（空欄＝今月）', '', '← プルダウンで過去の月も選べます。空欄にすると毎月自動で今月になります'],
    ['表示中の月', '', ''],
    ['月謝（円）', keepFee, '入金額の計算に使います'],
  ]);
  sh.getRange('B3').setNumberFormat('@').setValue(keepMonth).setBackground('#fff2cc');
  sh.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(monthColumns_(pay).map(function (m) { return m.ym; }).reverse(), true).setAllowInvalid(true).build());
  sh.getRange('B4').setFormula('=IF(B3="",TEXT(TODAY(),"yyyy/mm"),IF(ISNUMBER(B3),TEXT(B3,"yyyy/mm"),TRIM(B3)))').setFontWeight('bold');
  sh.getRange('C4').setFormula('=IF(' + C + 'M5=0,"⚠ 20_受領管理にこの月の列がありません","")').setFontColor('#b42318');
  sh.getRange('B5').setBackground('#fff2cc').setNumberFormat('#,##0');

  sh.getRange('A7').setValue('■ サマリー').setFontWeight('bold');
  const summary = [
    ['入金対象（在籍・開始済み）', '=' + target + ')', '解約しておらず、開始月が来ている人'],
    ['入金済み', '=COUNTIF(' + col('I') + ',TRUE)', '対象月に［受］チェックがある人'],
    ['未入金', '=' + target + ',' + col('I') + ',FALSE)', '入金対象のうちチェックがない人（右の一覧）'],
    ['入金率', rate(target + ',' + col('I') + ',TRUE)', target + ')'), '入金対象のうち入金済みの割合'],
    ['入金額（円）', '=B9*B5', '入金済み × 月謝'],
    ['前月の入金済み', '=COUNTIF(' + col('J') + ',TRUE)', ''],
    ['前月比', '=B9-B13', ''],
    ['今月から開始（新規）', '=COUNTIFS(' + col('A') + ',"<>",' + col('H') + ',FALSE,' + col('G') + ',' + C + '$M$2)', '開始月が対象月の人'],
    ['在籍数（解約除く）', '=COUNTIFS(' + col('A') + ',"<>",' + col('H') + ',FALSE)', ''],
  ];
  sh.getRange(8, 1, summary.length, 3).setValues(summary.map(function (r) { return [r[0], '', r[2]]; }));
  sh.getRange(8, 2, summary.length, 1).setFormulas(summary.map(function (r) { return [r[1]]; }));
  sh.getRange('B8:B16').setNumberFormat('#,##0').setFontWeight('bold').setFontSize(12);
  sh.getRange('B11').setNumberFormat('0.0%');
  sh.getRange('B12').setNumberFormat('#,##0"円"');
  sh.getRange('B14').setNumberFormat('+#,##0;-#,##0;0');
  sh.getRange('B10').setFontColor('#b42318');
  sh.getRange('C8:C16').setFontColor('#656d76');

  sh.getRange('A18').setValue('■ 事務所別').setFontWeight('bold');
  sh.getRange('A19:E19').setValues([['所属', '入金対象', '入金済み', '未入金', '入金率']]).setFontWeight('bold').setBackground('#eef3fe');
  const officeRow = function (r, name) {
    const o = name ? ',' + col('C') + ',"' + name + '"' : '';
    return [
      '=' + target + o + ')',
      '=COUNTIFS(' + col('A') + ',"<>",' + col('I') + ',TRUE' + o + ')',
      '=' + target + o + ',' + col('I') + ',FALSE)',
      '=IF(B' + r + '=0,"-",COUNTIFS(' + col('A') + ',"<>",' + col('H') + ',FALSE,' + col('G') + ',"<="&' + C + '$M$2,' + col('I') + ',TRUE' + o + ')/B' + r + ')',
    ];
  };
  const offices = OFFICES.concat(['']);
  sh.getRange(20, 1, offices.length, 1).setValues(offices.map(function (o) { return [o || '合計']; }));
  sh.getRange(20, 2, offices.length, 4).setFormulas(offices.map(function (o, i) { return officeRow(20 + i, o); }));
  sh.getRange(20, 2, offices.length, 3).setNumberFormat('#,##0');
  sh.getRange(20, 5, offices.length, 1).setNumberFormat('0.0%');
  sh.getRange(19 + offices.length, 1, 1, 5).setFontWeight('bold');

  const tStart = 21 + offices.length + 1;
  sh.getRange(tStart, 1).setValue('■ 月別の入金済み数（直近12ヶ月）').setFontWeight('bold');
  sh.getRange(tStart + 1, 1, 1, 3).setValues([['年月', '入金済み', '前月差']]).setFontWeight('bold').setBackground('#eef3fe');
  const trend = [];
  for (let i = 0; i < 12; i++) {
    const r = tStart + 2 + i;
    trend.push([
      '=TEXT(EDATE(DATE(LEFT($B$4,4),RIGHT($B$4,2),1),' + (i - 11) + '),"yyyy/mm")',
      '=IFERROR(COUNTIF(INDEX(' + body + ',0,MATCH(A' + r + ',' + hdrNorm + ',0)),TRUE),"")',
      i === 0 ? '' : '=IF(OR(B' + r + '="",B' + (r - 1) + '=""),"",B' + r + '-B' + (r - 1) + ')',
    ]);
  }
  sh.getRange(tStart + 2, 1, 12, 3).setFormulas(trend);
  sh.getRange(tStart + 2, 2, 12, 2).setNumberFormat('#,##0');
  sh.insertChart(sh.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(tStart + 1, 1, 13, 2))
    .setNumHeaders(1)
    .setPosition(tStart + 15, 1, 0, 0)
    .setOption('title', '月別の入金済み数')
    .setOption('legend.position', 'none')
    .setOption('colors', ['#2563eb'])
    .setOption('width', 560)
    .setOption('height', 280)
    .build());

  sh.getRange('G7').setFormula('="■ 未入金者一覧（"&B10&"人）"').setFontWeight('bold');
  sh.getRange('G8:L8').setValues([['ANNIN No.', '姓名', '所属', '開始年月', '入金月数', '最終入金月']]).setFontWeight('bold').setBackground('#fdecea');
  sh.getRange('G9').setFormula('=IFERROR(SORT(FILTER(' + C + 'A2:F,' + col('A') + '<>"",' + col('H') + '=FALSE,' + col('G') + '<=' + C + '$M$2,' + col('I') + '=FALSE),1,TRUE),"未入金者はいません")');

  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 300);
  sh.setColumnWidths(4, 3, 80);
  sh.setColumnWidth(6, 24);
  sh.setColumnWidths(7, 6, 95);
  sh.setFrozenRows(4);
}

/** 1 → A、27 → AA */
function colLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 受領管理に行が増えたとき、計算用シートの行が足りなくならないようにする */
function ensureCalcRows_(ss) {
  const calc = ss.getSheetByName(DASH.calc);
  if (!calc) return;
  const need = sheet_(ss, SHEET.payment).getMaxRows() + 100;
  if (calc.getMaxRows() < need) calc.insertRowsAfter(calc.getMaxRows(), need - calc.getMaxRows() + 900);
}

// ===== 小さな関数 ==========================================================

function sheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」が見つかりません');
  return sh;
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/** 2026/10・2026-10・2026年10月・日付 → "2026/10"。読めなければ "" */
function normYm_(v) {
  if (isDate_(v)) return v.getFullYear() + '/' + ('0' + (v.getMonth() + 1)).slice(-2);
  const m = toHalf_(String(v === null || v === undefined ? '' : v)).match(/(\d{4})\s*[\/\-年.]\s*(\d{1,2})/);
  if (!m) return '';
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return '';
  return m[1] + '/' + ('0' + mo).slice(-2);
}

function currentYm_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM');
}

function toNo_(v) {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.floor(v) : null;
  const s = toHalf_(String(v === null || v === undefined ? '' : v)).trim();
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null;
}

function parseNoList_(text) {
  return toHalf_(String(text || ''))
    .split(/[\s,、，;]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

/** 全角英数字・記号を半角に */
function toHalf_(s) {
  return String(s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); }).replace(/　/g, ' ');
}

function toKatakana_(s) {
  return String(s).replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
}

/** 比較用：半角化・カタカナ化・空白除去・小文字化 */
function normText_(v) {
  return toKatakana_(toHalf_(String(v === null || v === undefined ? '' : v))).replace(/\s+/g, '').toLowerCase();
}

function matchesAny_(v, names) {
  const key = normText_(v).replace(/\./g, '');
  return names.some(function (n) { return normText_(n).replace(/\./g, '') === key; });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('ほかの人が登録中です。少し待ってからもう一度お試しください');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ===== アプリの画面（HTML） ================================================

const APP_HTML_ = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1f2328; --muted:#656d76; --line:#d8dee4; --accent:#2563eb; --ok:#15803d; --okbg:#e8f5ec; --ng:#b42318; --ngbg:#fdecea; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif; }
  .wrap { max-width:680px; margin:0 auto; padding:16px; }
  h1 { font-size:18px; margin:4px 0 12px; }
  .tabs { display:flex; gap:8px; margin-bottom:12px; }
  .tabs button { flex:1; padding:10px; border:1px solid var(--line); background:var(--card); border-radius:8px; font-size:15px; cursor:pointer; }
  .tabs button.on { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:12px; }
  .card h2 { font-size:15px; margin:0 0 10px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 12px; }
  .full { grid-column:1 / -1; }
  label { display:block; font-size:13px; color:var(--muted); margin-bottom:4px; }
  .req::after { content:" *"; color:var(--ng); }
  input, select, textarea { width:100%; padding:9px 10px; border:1px solid var(--line); border-radius:6px; font-size:16px; background:#fff; color:var(--text); }
  textarea { min-height:70px; }
  .seg { display:flex; gap:8px; }
  .seg label { flex:1; margin:0; padding:9px; border:1px solid var(--line); border-radius:6px; text-align:center; color:var(--text); cursor:pointer; font-size:15px; }
  .seg input { display:none; }
  .seg input:checked + span { font-weight:700; color:var(--accent); }
  .seg label:has(input:checked) { border-color:var(--accent); background:#eef3fe; }
  .btn { display:inline-block; padding:11px 18px; border:0; border-radius:8px; background:var(--accent); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
  .btn.sub { background:#fff; color:var(--text); border:1px solid var(--line); }
  .btn:disabled { opacity:.5; cursor:default; }
  .hint { font-size:12px; color:var(--muted); margin-top:4px; }
  .msg { padding:10px 12px; border-radius:8px; margin-bottom:12px; white-space:pre-wrap; display:none; }
  .msg.ok { display:block; background:var(--okbg); color:var(--ok); }
  .msg.ng { display:block; background:var(--ngbg); color:var(--ng); }
  .row { display:flex; gap:8px; align-items:flex-end; }
  .row > div { flex:1; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { padding:8px 6px; border-bottom:1px solid var(--line); text-align:left; vertical-align:middle; }
  th { font-size:12px; color:var(--muted); font-weight:600; }
  .paid { color:var(--ok); font-weight:700; }
  .unpaid { color:var(--muted); }
  .small { font-size:12px; color:var(--muted); }
  @media (max-width:520px) { .grid { grid-template-columns:1fr; } .hide-sm { display:none; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>ANNIN 登録・入金チェック</h1>
  <div class="tabs">
    <button id="tab-reg" class="on" onclick="showTab('reg')">新規登録</button>
    <button id="tab-pay" onclick="showTab('pay')">入金チェック</button>
  </div>
  <div id="msg" class="msg"></div>

  <form id="pane-reg" onsubmit="submitReg(event)">
    <div class="card">
      <h2>基本情報</h2>
      <div class="grid">
        <div class="full">
          <label>① ANNIN No.</label>
          <input name="no" inputmode="numeric" placeholder="空欄なら自動で振ります">
          <div class="hint" id="nextNoHint">読み込み中…</div>
        </div>
        <div><label class="req">② 姓</label><input name="lastName" required></div>
        <div><label class="req">② 名</label><input name="firstName" required></div>
        <div><label class="req">③ セイ（読み方）</label><input name="lastKana" required placeholder="ヤマダ"></div>
        <div><label class="req">③ メイ（読み方）</label><input name="firstKana" required placeholder="ハナコ"></div>
        <div class="full">
          <label class="req">④ 所属</label>
          <div class="seg" id="officeSeg"></div>
        </div>
        <div><label class="req">⑤ 開始月</label><input name="start" type="month" required></div>
        <div><label>性別（任意）</label><select name="gender" id="genderSel"><option value="">－</option></select></div>
      </div>
    </div>
    <div class="card">
      <h2>個人情報（⑥ 住所）</h2>
      <div class="grid">
        <div><label>郵便番号</label><input name="zip" inputmode="numeric" placeholder="123-4567"></div>
        <div><label>電話番号</label><input name="phone" inputmode="tel"></div>
        <div class="full"><label>住所</label><input name="address"></div>
      </div>
    </div>
    <div class="card">
      <h2>個人情報（⑦ 銀行情報）</h2>
      <div class="grid">
        <div><label>銀行名</label><input name="bankName" placeholder="三菱UFJ銀行"></div>
        <div><label>支店名</label><input name="branch"></div>
        <div><label>区分</label><select name="accountType" id="typeSel"></select></div>
        <div><label>口座番号</label><input name="accountNo" inputmode="numeric"></div>
        <div class="full"><label>口座名義（カナ）</label><input name="holder"></div>
      </div>
    </div>
    <button class="btn" id="regBtn" type="submit">スプレッドシートに登録</button>
  </form>

  <div id="pane-pay" style="display:none">
    <div class="card">
      <h2>探してチェック</h2>
      <div class="row">
        <div><label>対象月</label><select id="monthSel"></select></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div><label>ANNIN No. または 名前・カナ</label><input id="q" placeholder="例：123 / 山田 / ヤマダ" onkeydown="if(event.key==='Enter'){event.preventDefault();doSearch();}"></div>
        <button class="btn" type="button" onclick="doSearch()">検索</button>
      </div>
      <div id="results" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <h2>まとめてチェック</h2>
      <label>ANNIN No.（改行・カンマ・空白区切りで貼り付け）</label>
      <textarea id="bulk" placeholder="12&#10;45&#10;1203"></textarea>
      <div style="margin-top:10px"><button class="btn" type="button" id="bulkBtn" onclick="doBulk()">対象月に入金済みチェックを付ける</button></div>
    </div>
  </div>
</div>

<script>
var INIT = null;
var lastResults = [];

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function showMsg(text, ok) { var m = document.getElementById('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'ng'); window.scrollTo(0, 0); }
function clearMsg() { document.getElementById('msg').className = 'msg'; }
function errText(e) { return (e && e.message ? e.message : String(e)).replace(/^Error:\\s*/, ''); }
function call(fn, args, onOk, onDone) {
  var r = google.script.run.withSuccessHandler(function (res) { if (onDone) onDone(); onOk(res); })
    .withFailureHandler(function (e) { if (onDone) onDone(); showMsg(errText(e), false); });
  r[fn].apply(r, args);
}

function showTab(t) {
  clearMsg();
  ['reg', 'pay'].forEach(function (k) {
    document.getElementById('pane-' + k).style.display = k === t ? '' : 'none';
    document.getElementById('tab-' + k).className = k === t ? 'on' : '';
  });
}

function init(d) {
  INIT = d;
  document.getElementById('nextNoHint').textContent = '次の番号：' + d.nextNo + '（既存の番号とかぶらないように自動で振ります）';
  document.getElementById('officeSeg').innerHTML = d.offices.map(function (o, i) {
    return '<label><input type="radio" name="office" value="' + esc(o) + '"' + (i === 0 ? ' required' : '') + '><span>' + esc(o) + '</span></label>';
  }).join('');
  document.getElementById('genderSel').innerHTML += d.genders.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
  document.getElementById('typeSel').innerHTML = d.accountTypes.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
  document.querySelector('[name=start]').value = d.currentMonth.replace('/', '-');
  var sel = document.getElementById('monthSel');
  var months = d.months.slice();
  sel.innerHTML = months.map(function (m) { return '<option' + (m === d.currentMonth ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('');
  if (months.indexOf(d.currentMonth) < 0 && months.length) sel.value = months[months.length - 1];
}

function formData(force) {
  var f = document.getElementById('pane-reg');
  var o = {};
  Array.prototype.forEach.call(f.elements, function (el) {
    if (!el.name) return;
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; return; }
    o[el.name] = el.value;
  });
  o.start = (o.start || '').replace('-', '/');
  o.force = !!force;
  return o;
}

function submitReg(ev, force) {
  if (ev) ev.preventDefault();
  clearMsg();
  var btn = document.getElementById('regBtn');
  btn.disabled = true; btn.textContent = '登録中…';
  call('registerTalent', [formData(force)], function (res) {
    if (!res.ok && res.duplicates) {
      var list = res.duplicates.map(function (d) { return 'No.' + d.no + ' ' + d.name + '（' + d.office + '・' + d.start + '開始・' + d.status + '）'; }).join('\\n');
      if (confirm('同じ名前の人がすでに登録されています。\\n\\n' + list + '\\n\\n別人として登録しますか？')) submitReg(null, true);
      return;
    }
    showMsg('登録しました：ANNIN No. ' + res.no + '　' + res.fullName, true);
    document.getElementById('pane-reg').reset();
    document.querySelector('[name=start]').value = INIT.currentMonth.replace('/', '-');
    document.getElementById('nextNoHint').textContent = '次の番号：' + res.nextNo + '（既存の番号とかぶらないように自動で振ります）';
  }, function () { btn.disabled = false; btn.textContent = 'スプレッドシートに登録'; });
}

function month() { return document.getElementById('monthSel').value; }

function doSearch() {
  clearMsg();
  var q = document.getElementById('q').value.trim();
  if (!q) return;
  document.getElementById('results').innerHTML = '<div class="small">検索中…</div>';
  call('searchTalents', [q, month()], renderResults);
}

function renderResults(list) {
  lastResults = list;
  var box = document.getElementById('results');
  if (!list.length) { box.innerHTML = '<div class="small">見つかりませんでした</div>'; return; }
  box.innerHTML = '<div class="small">' + esc(month()) + ' の入金状況（' + list.length + '件' + (list.length >= 50 ? '・先頭50件' : '') + '）</div>' +
    '<table><tr><th>No.</th><th>名前</th><th class="hide-sm">所属</th><th class="hide-sm">状態</th><th>' + esc(month()) + '</th></tr>' +
    list.map(function (r, i) {
      var btn = !r.inPayment ? '<span class="small">受領管理に行なし</span>' :
        r.paid ? '<span class="paid">✓ 入金済</span> <button class="btn sub" style="padding:4px 8px;font-size:12px" onclick="toggle(' + i + ', false)">取消</button>'
               : '<button class="btn" style="padding:6px 12px;font-size:13px" onclick="toggle(' + i + ', true)">入金済にする</button>';
      return '<tr><td>' + r.no + '</td><td>' + esc(r.name) + '<div class="small">' + esc(r.kana) + '</div></td>' +
        '<td class="hide-sm">' + esc(r.office) + '</td><td class="hide-sm">' + esc(r.status) + '<div class="small">入金' + r.paidCount + 'ヶ月</div></td><td>' + btn + '</td></tr>';
    }).join('') + '</table>';
}

function toggle(i, paid) {
  var r = lastResults[i];
  if (!paid && !confirm('No.' + r.no + ' ' + r.name + ' の ' + month() + ' の入金チェックを外しますか？')) return;
  call('setPayment', [r.no, month(), paid], function () {
    showMsg('No.' + r.no + ' ' + r.name + '：' + month() + ' を' + (paid ? '入金済みにしました' : '未入金に戻しました'), true);
    doSearch();
  });
}

function doBulk() {
  clearMsg();
  var text = document.getElementById('bulk').value;
  var btn = document.getElementById('bulkBtn');
  if (!confirm(month() + ' に入金済みチェックを付けます。よろしいですか？')) return;
  btn.disabled = true;
  call('setPaymentsBulk', [text, month()], function (res) {
    var lines = [res.month + '：' + res.done.length + '件にチェックを付けました'];
    if (res.done.length) lines.push('　→ ' + res.done.join(', '));
    if (res.already.length) lines.push('すでにチェック済み：' + res.already.join(', '));
    if (res.notFound.length) lines.push('見つからない番号：' + res.notFound.join(', '));
    showMsg(lines.join('\\n'), res.notFound.length === 0);
    if (!res.notFound.length) document.getElementById('bulk').value = '';
  }, function () { btn.disabled = false; });
}

call('getInitData', [], init);
</script>
</body>
</html>`;
