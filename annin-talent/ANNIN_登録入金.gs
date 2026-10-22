// ANNIN タレント管理：新規登録・入金チェックアプリ
//
// スプレッドシート「ANNIN_タレント管理シート（kintone移行版）」に貼り付けて使う Apps Script です。
//
//   ① 新規登録：アプリに入力すると、次の3シートに1行ずつ自動で追加する
//        - 10_タレント台帳      … ANNIN No.・姓・名・姓（カナ）・名（カナ）・性別・開始年月・所属事務所
//        - 20_受領管理          … ANNIN No.・姓名・所属事務所・開始年月（月の列はチェックなし）
//        - 30_個人情報（銀行口座）… 郵便番号・住所・電話番号・銀行名・支店名・区分・口座名義・口座番号
//      ANNIN No. は3シートの最大の番号＋1を自動で振る（手入力した番号が使用済みなら登録しない）
//   ② 入金チェック：ANNIN No. か名前（カナも可）で探して、その月のステータス（振込・サブスク・休止・退所など）と
//      支払方法（振込など）を入れる。ANNIN No. をまとめて貼り付けて一括で入れることもできる
//   ③ 入金ダッシュボード：今月（または選んだ月）の入金数・未入金数・入金率・事務所別・ステータス別・未入金者一覧・月別推移
//   ④ 受領管理のステータス形式への変換：チェックボックス（TRUE/FALSE）をプルダウン（振込・サブスク…）に変える。
//      上に月ごとの集計行、左に支払方法・着金日の列を追加し、ステータスで色分けする（最初に1回だけ）
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

/**
 * 20_受領管理の月の列に入れるステータス（プルダウンの順）と色。
 * paid に入っているステータスを「入金済み」（その月の月謝の入金）として数える。
 * excluded に入っているステータスの人は、その月の入金対象から外す（未入金に数えない）。
 * 当月開始は「入会金は払ったが月謝はまだ」の月なので、入金済みにも未入金にも数えない。
 */
const STATUS = {
  list: ['当月開始', '振込', 'サブスク', '翌月支払い', '未入金', '休止', '退所', 'クーオフ'],
  paid: ['振込', 'サブスク'],
  // 以前のステータス名 → 今の名前（残っていても入金済みとして数え、メニューで置き換えられる）
  renamed: { 入金あり: '振込' },
  excluded: ['当月開始', '休止', '退所', 'クーオフ'],
  colors: {
    当月開始: ['#cfe2f3', '#1f2328'],
    振込: ['#f4cccc', '#1f2328'],
    サブスク: ['#d9ead3', '#1f2328'],
    翌月支払い: ['#fff2cc', '#1f2328'],
    未入金: ['#fce5cd', '#b42318'],
    休止: ['#e8e8e8', '#1f2328'],
    退所: ['#434343', '#ffffff'],
    クーオフ: ['#d9d2e9', '#1f2328'],
  },
};

/**
 * 新規登録で選べる「開始月の入金」。登録と同時に、20_受領管理の開始月にこのステータスを入れる。
 * method：支払方法が空欄のときに入れる支払方法
 */
/** 振込で入金があった月のステータス（チェックボックスの TRUE もこれとして扱う） */
const PAID_DEFAULT = '振込';

const START_PAYMENTS = [
  { key: 'transfer', label: '振込', status: PAID_DEFAULT, method: '振込' },
  { key: 'subscription', label: 'サブスク', status: 'サブスク', method: '' },
  { key: 'start', label: '当月開始（入会金のみ）', status: '当月開始', method: '' },
  { key: 'none', label: '入れない', status: '', method: '' },
];

/** アプリで選べる支払方法 */
const PAY_METHODS = ['振込', 'スクエア', 'JMS'];

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
  method: ['支払方法'],
  paidDate: ['着金日'],
  targetCheck: ['対象月チェック（ダッシュボードB4連動）', '対象月チェック'],
};

// ===== 画面 ===============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ANNIN管理')
    .addItem('登録・入金アプリを開く', 'openAppDialog')
    .addItem('入金ダッシュボードを作成・更新', 'buildPaymentDashboard')
    .addSeparator()
    .addItem('受領管理をステータス形式に変換（最初に1回だけ）', 'convertPaymentSheet')
    .addItem('受領管理の色分け・集計・数式を整える', 'refreshPaymentSheet')
    .addItem('受領管理に次の12ヶ月の列を追加', 'addNextYearMonths')
    .addItem('受領管理の「入金あり」を「振込」に置き換える', 'renameOldStatuses')
    .addItem('振込の人の支払方法を「振込」にする（空欄の人だけ）', 'fillTransferMethod')
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
  const pay = readTable_(sheet_(ss, SHEET.payment));
  const months = monthColumns_(pay).map(function (m) { return m.ym; });
  return {
    nextNo: nextAnninNo_(ss),
    months: months,
    currentMonth: currentYm_(),
    offices: OFFICES,
    genders: GENDERS,
    accountTypes: ACCOUNT_TYPES,
    statuses: STATUS.list,
    paidStatuses: STATUS.paid,
    statusColors: STATUS.colors,
    methods: PAY_METHODS,
    statusMode: isStatusMode_(pay),
    startPayments: START_PAYMENTS.map(function (x) { return { key: x.key, label: x.label }; }),
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
      no: no, fullName: fullName, office: f.office, start: f.start, paidCount: 0, lastPaid: '', method: f.method,
    }, { uncheckMonths: true });
    appendRecord_(sheet_(ss, SHEET.personal), {
      no: no, fullName: fullName, zip: f.zip, address: f.address, phone: f.phone,
      bankName: f.bankName, branch: f.branch, accountType: f.accountType, holder: f.holder, accountNo: f.accountNo,
    });
    // 開始月の入金：受領管理の開始月にステータスを入れる（その月の列がなければ入れずに知らせる）
    let startNote = '';
    const sp = START_PAYMENTS.filter(function (x) { return x.key === f.startPayment; })[0];
    if (sp && sp.status) {
      if (findMonthCol_(readTable_(sheet_(ss, SHEET.payment)), f.start)) {
        setPayments_(ss, [no], f.start, sp.status, { method: f.method || sp.method });
        startNote = f.start + ' を「' + sp.status + '」にしました';
      } else {
        startNote = '20_受領管理に ' + f.start + ' の列がないため、開始月の入金は入れていません';
      }
    }
    ensureCalcRows_(ss);
    SpreadsheetApp.flush();
    return { ok: true, no: no, fullName: fullName, nextNo: nextAnninNo_(ss), startNote: startNote };
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
      paid: p && monthCol ? isPaidValue_(p.values[monthCol.index]) : false,
      monthStatus: p && monthCol ? statusOf_(p.values[monthCol.index]) : '',
      method: p ? String(cell_(pay, p, 'method')) : '',
      paidDate: p ? fmtDay_(cell_(pay, p, 'paidDate')) : '',
      inPayment: !!p,
      paidCount: p ? countPaid_(pay, p.values) : 0,
    });
  });
  return out.slice(0, 50);
}

/**
 * 1人の指定月のステータスを入れる。status は STATUS.list のどれか、空欄に戻すときは ''。
 * （以前の呼び方 setPayment(no, month, true/false) も使える：true＝振込、false＝空欄。「入金あり」は「振込」として入れる）
 * extra.method：支払方法、extra.date：着金日（yyyy-mm-dd）。空なら変えない。
 */
function setPayment(no, month, status, extra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return withLock_(function () {
    const res = setPayments_(ss, [no], month, status, extra);
    if (res.notFound.length) throw new Error('20_受領管理 に ANNIN No. ' + no + ' が見つかりません');
    return res;
  });
}

/** ANNIN No. をまとめて入れる（改行・カンマ・空白区切りの文字列）。status を省略すると「振込」 */
function setPaymentsBulk(text, month, status, extra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nos = parseNoList_(text);
  if (!nos.length) throw new Error('ANNIN No. を入力してください');
  return withLock_(function () { return setPayments_(ss, nos, month, status === undefined ? PAID_DEFAULT : status, extra); });
}

// ===== 中身 ===============================================================

function setPayments_(ss, nos, month, status, extra) {
  const ym = normYm_(month);
  if (!ym) throw new Error('対象月を選んでください');
  if (status === true) status = PAID_DEFAULT;
  if (status === false || status === null || status === undefined) status = '';
  status = String(status).trim();
  if (STATUS.renamed[status]) status = STATUS.renamed[status];
  if (status !== '' && STATUS.list.indexOf(status) < 0) throw new Error('ステータス「' + status + '」は選べません');
  extra = extra || {};
  const method = String(extra.method || '').trim();
  if (method && PAY_METHODS.indexOf(method) < 0) throw new Error('支払方法「' + method + '」は選べません');
  const date = extra.date ? String(extra.date).replace(/-/g, '/') : '';
  const sh = sheet_(ss, SHEET.payment);
  const pay = readTable_(sh);
  const col = findMonthCol_(pay, ym);
  if (!col) throw new Error('20_受領管理 に「' + ym + '」の列がありません。先にシートに月の列を追加してください');
  const byNo = rowsByNo_(pay);
  const statusMode = isStatusMode_(pay);
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
    let changed = false;
    if (statusMode) {
      if (method && pay.col.method !== undefined && String(p.values[pay.col.method]) !== method) {
        sh.getRange(p.rowNumber, pay.col.method + 1).setValue(method);
        changed = true;
      }
      if (date && pay.col.paidDate !== undefined && fmtDay_(p.values[pay.col.paidDate]) !== date) {
        sh.getRange(p.rowNumber, pay.col.paidDate + 1).setNumberFormat('@').setValue(date);
        changed = true;
      }
    }
    const value = statusMode ? status : isPaidValue_(status);
    const same = statusMode ? statusOf_(p.values[col.index]) === status : isPaidValue_(p.values[col.index]) === value;
    if (!same) {
      const cellRange = sh.getRange(p.rowNumber, col.index + 1);
      try {
        cellRange.setValue(value);
      } catch (e) {
        // プルダウンの選択肢が古い（ステータス名を変えた後など）と入力規則で弾かれるので、選択肢を今のものにして入れ直す
        if (!statusMode) throw e;
        applyStatusValidation_(sh, pay);
        cellRange.setValue(value);
      }
      p.values[col.index] = value;
      refreshPaidSummary_(sh, pay, p, ledgerSheet, ledger, ledgerByNo[no]);
      changed = true;
    }
    (changed ? done : already).push(no);
  });
  return { ok: true, month: ym, status: status, paid: isPaidValue_(status), statusMode: statusMode, done: done, already: already, notFound: notFound };
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
  return monthColumns_(pay).filter(function (m) { return isPaidValue_(values[m.index]); }).length;
}

function lastPaid_(pay, values) {
  const paid = monthColumns_(pay).filter(function (m) { return isPaidValue_(values[m.index]); });
  return paid.length ? paid[paid.length - 1].ym : '';
}

/**
 * データの最終行の下に1行追加する。
 * - data のキーに対応する列には値を書く
 * - それ以外で、1つ上の行が数式の列は数式を引き継ぐ（R1C1 でコピーするので行番号がずれない）
 * - 書式・入力規則（チェックボックス・プルダウン）も1つ上の行からコピーする
 * - opts.uncheckMonths：月の列（YYYY/MM）は空にする（チェックボックス形式ならチェックなし＝FALSE）
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
  const emptyMonth = isStatusMode_(t) ? '' : false;
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
      line.push(emptyMonth);
    } else if (Object.prototype.hasOwnProperty.call(byIdx, c)) {
      const v = byIdx[c];
      if (c === t.col.start && v !== '') {
        // 既存の開始年月が日付なら日付で、文字列なら文字列（"2026/10"）で書く
        if (isDate_(tplValue)) {
          line.push(ymToDate_(v));
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
  for (let r = 0; r < Math.min(values.length, 30); r++) {
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
    method: s(form.method),
    startPayment: s(form.startPayment) || 'none',
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
  if (f.method && PAY_METHODS.indexOf(f.method) < 0) errors.push('支払方法の値が正しくありません');
  if (!START_PAYMENTS.some(function (x) { return x.key === f.startPayment; })) errors.push('開始月の入金の値が正しくありません');
  if (f.accountNo && !/^\d+$/.test(f.accountNo)) errors.push('口座番号は数字で入力してください');
  if (errors.length) throw new Error(errors.join('\n'));
  // 読み方はカタカナにそろえる（ひらがなで入力されても OK）
  f.lastKana = toKatakana_(f.lastKana);
  f.firstKana = toKatakana_(f.firstKana);
  return f;
}

// ===== 受領管理のステータス形式 ==============================================
//
// メニュー「受領管理をステータス形式に変換（最初に1回だけ）」で、20_受領管理 を次の形にする。
//   - 月の列：チェックボックス → ステータスのプルダウン（STATUS.list）。ステータスごとに色分け
//       チェックあり → 振込
//       チェックなし → 在籍中（台帳で解約なし）の人の、開始月〜先月は「未入金」、それ以外は空欄
//   - 開始年月の右に「支払方法」「着金日」の列を追加
//   - いちばん上に月ごとの集計行（入金済み計・ステータスごとの人数）を追加
//   - 入金月数・最終入金月・対象月チェックの数式を、ステータスで数えるように書き直す
//   - 10_タレント台帳の入金月数・最終入金月・ステータス・銀行情報登録を、ANNIN No. で探す数式に書き直す
//     （これまでは同じ行番号を見ていたため、台帳にだけ行を足すと別の人の値になっていた）
//   - 50_月次推移をステータスで数えるように書き直す
//   - 台帳にいて受領管理・個人情報にいない人の行を追加する
// 変換前の 20_受領管理 は「20_受領管理_変換前_日時」という非表示シートに残す。

/** 受領管理のいちばん上に置く集計行（この下に空行を1行あけて見出し行） */
const PAY_SUMMARY_ROWS = ['入金済み計'].concat(STATUS.list);

function convertPaymentSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const ans = ui.alert('受領管理をステータス形式に変換',
    '20_受領管理のチェックボックスを、ステータス（' + STATUS.list.join('・') + '）のプルダウンに変えます。\n\n'
    + '・チェックあり → 振込\n'
    + '・チェックなし → 在籍中の人の開始月〜先月は「未入金」、それ以外は空欄\n\n'
    + '変換前の状態は「20_受領管理_変換前_日時」という非表示のシートに残します。変換しますか？',
    ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  const res = withLock_(function () { return convertPaymentSheet_(ss); });
  const counts = STATUS.list.map(function (s) { return s + '：' + res.counts[s]; }).join('　');
  ui.alert('変換しました', [
    '変換前のバックアップ：' + res.backupName,
    '変換後のセル数　' + counts,
    res.tzChanged ? 'スプレッドシートのタイムゾーンを「' + res.tzChanged + '」から「東京」に変えました（開始年月の日付が前月末日になるずれを直すため）' : '',
    refreshMessage_(res),
  ].filter(function (x) { return x; }).join('\n\n'), ui.ButtonSet.OK);
}

function refreshPaymentSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const res = withLock_(function () { return refreshPaymentSheet_(ss); });
  SpreadsheetApp.getUi().alert('受領管理を整えました', refreshMessage_(res), SpreadsheetApp.getUi().ButtonSet.OK);
}

function addNextYearMonths() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const added = withLock_(function () { return addMonths_(ss, 12); });
  SpreadsheetApp.getUi().alert('月の列を追加しました', added[0] + '〜' + added[added.length - 1] + ' の列を追加しました。',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function renameOldStatuses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const pairs = Object.keys(STATUS.renamed).map(function (k) { return '「' + k + '」→「' + STATUS.renamed[k] + '」'; }).join('、');
  const ans = ui.alert('ステータスの名前を置き換える', '20_受領管理の月のマスの ' + pairs + ' に、まとめて置き換えます。よろしいですか？', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  const n = withLock_(function () { return renameOldStatuses_(ss); });
  ui.alert('置き換えました', n + 'マスを置き換えました。プルダウン・色分け・集計・ダッシュボードも新しい名前にしました。', ui.ButtonSet.OK);
}

/** 月のマスの以前のステータス名（STATUS.renamed）を今の名前にして、受領管理を整え直す。置き換えたマスの数を返す */
function renameOldStatuses_(ss) {
  const sh = sheet_(ss, SHEET.payment);
  const pay = readTable_(sh);
  if (!isStatusMode_(pay)) throw new Error('先にメニューの「受領管理をステータス形式に変換」を実行してください');
  const months = monthColumns_(pay);
  checkMonthColumns_(months);
  const first = pay.headerRow + 1;
  const rows = sh.getLastRow() - pay.headerRow;
  let n = 0;
  if (rows > 0) {
    const range = sh.getRange(first, months[0].index + 1, rows, months.length);
    const values = range.getValues().map(function (line) {
      return line.map(function (v) {
        const k = typeof v === 'string' ? v.trim() : '';
        if (STATUS.renamed[k]) { n++; return STATUS.renamed[k]; }
        return v;
      });
    });
    if (n) {
      // 古いプルダウン（新しい名前が選択肢にない）のままだと書き込めないので、先に入力規則を外す（このあと整え直す）
      range.clearDataValidations();
      range.setValues(values);
    }
  }
  refreshPaymentSheet_(ss);
  return n;
}

function fillTransferMethod() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const ans = ui.alert('支払方法を「振込」にする',
    '20_受領管理で、どこかの月が「振込」になっていて支払方法が空欄の人を、まとめて「振込」にします。\n'
    + '（支払方法がすでに入っている人・サブスクだけの人は変えません）よろしいですか？', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  const res = withLock_(function () { return fillMethodForPaid_(ss, '振込'); });
  ui.alert('支払方法を「振込」にしました', res.length + '人の支払方法を「振込」にしました。', ui.ButtonSet.OK);
}

/** どこかの月が「振込」で、支払方法が空欄の人の支払方法を method にする。変えた ANNIN No. を返す */
function fillMethodForPaid_(ss, method) {
  const sh = sheet_(ss, SHEET.payment);
  const pay = readTable_(sh);
  if (!isStatusMode_(pay)) throw new Error('先にメニューの「受領管理をステータス形式に変換」を実行してください');
  const months = monthColumns_(pay);
  const changed = [];
  const col = pay.col.method;
  const first = pay.headerRow + 1;
  const rows = sh.getLastRow() - pay.headerRow;
  if (rows < 1) return changed;
  const values = sh.getRange(first, col + 1, rows, 1).getValues();
  pay.rows.forEach(function (row) {
    if (String(row.values[col]).trim() !== '') return;
    if (!months.some(function (m) { return statusOf_(row.values[m.index]) === PAID_DEFAULT; })) return;
    values[row.rowNumber - first][0] = method;
    changed.push(toNo_(row.values[0]));
  });
  if (changed.length) sh.getRange(first, col + 1, rows, 1).setValues(values);
  return changed;
}

function refreshMessage_(res) {
  const lines = [];
  if (res.added.length) lines.push('20_受領管理に追加した人（台帳にだけいた人）：No.' + res.added.join(', '));
  if (res.addedPersonal.length) lines.push('30_個人情報に追加した人（住所・口座は空欄）：No.' + res.addedPersonal.join(', '));
  if (res.duplicates.length) lines.push('⚠ 10_タレント台帳で ANNIN No. が重複しています：No.' + res.duplicates.join(', ') + '（どちらかの番号を直してください）');
  if (!lines.length) lines.push('台帳・受領管理・個人情報の人数はそろっています。');
  return lines.join('\n');
}

function convertPaymentSheet_(ss) {
  const sh = sheet_(ss, SHEET.payment);
  let pay = readTable_(sh);
  if (isStatusMode_(pay)) throw new Error('20_受領管理 はすでにステータス形式です');
  if (pay.col.start === undefined) throw new Error('20_受領管理 に「開始年月」の列が見つかりません');
  const months = monthColumns_(pay);
  checkMonthColumns_(months);

  // 対象月チェック列（台帳のステータスの元）が見る「対象月」のセル。入金ダッシュボードがあればそのB4（空欄なら今月）
  const monthRef = targetMonthRef_(ss, sh, pay);

  // スプレッドシートのタイムゾーンを東京にする（違うと、日付の開始年月が前月末日になる）
  let tzChanged = '';
  if (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone() !== 'Asia/Tokyo') {
    tzChanged = ss.getSpreadsheetTimeZone();
    ss.setSpreadsheetTimeZone('Asia/Tokyo');
    TZ_CACHE_ = 'Asia/Tokyo';
  }

  // 1. バックアップ
  const backupName = SHEET.payment + '_変換前_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd_HHmm');
  const backup = sh.copyTo(ss);
  backup.setName(backupName);
  backup.hideSheet();

  // 2. チェック → ステータス
  const ledger = readTable_(sheet_(ss, SHEET.ledger));
  const cancelled = {};
  ledger.rows.forEach(function (r) { if (cell_(ledger, r, 'cancel') === true) cancelled[toNo_(r.values[0])] = true; });
  const rowMap = {};
  pay.rows.forEach(function (r) { rowMap[r.rowNumber] = r; });
  const cur = currentYm_();
  const firstRow = pay.headerRow + 1;
  const nRows = Math.max(sh.getLastRow() - pay.headerRow, 1);
  const old = sh.getRange(firstRow, months[0].index + 1, nRows, months.length).getValues();
  const counts = {};
  STATUS.list.forEach(function (s) { counts[s] = 0; });
  const block = old.map(function (line, i) {
    const row = rowMap[firstRow + i];
    const no = row ? toNo_(row.values[0]) : null;
    const start = row ? normYm_(cell_(pay, row, 'start')) : '';
    return line.map(function (v, j) {
      const ym = months[j].ym;
      let out = '';
      if (v === true) out = PAID_DEFAULT;
      else if (typeof v === 'string' && STATUS.list.indexOf(statusOf_(v)) >= 0) out = statusOf_(v);
      else if (no !== null && !cancelled[no] && start && ym >= start && ym < cur) out = '未入金';
      if (out) counts[out]++;
      return out;
    });
  });

  // 3. 開始年月の右に「支払方法」「着金日」、4. いちばん上に集計行
  sh.insertColumnsAfter(pay.col.start + 1, 2);
  sh.getRange(pay.headerRow, pay.col.start + 2, 1, 2).setValues([['支払方法', '着金日']]);
  sh.insertRowsBefore(1, PAY_SUMMARY_ROWS.length + 1);
  pay = readTable_(sh);
  const range = sh.getRange(pay.headerRow + 1, monthColumns_(pay)[0].index + 1, block.length, months.length);
  range.clearDataValidations();
  range.setValues(block);

  const res = refreshPaymentSheet_(ss, { monthRef: monthRef });
  res.backupName = backupName;
  res.counts = counts;
  res.tzChanged = tzChanged;
  return res;
}

/**
 * ステータス形式の受領管理を整える（何度実行しても安全）。
 * プルダウン・色分け・集計行・行ごとの数式・台帳の数式・50_月次推移・ダッシュボードを作り直し、
 * 台帳にいて受領管理・個人情報にいない人の行を追加する。
 */
function refreshPaymentSheet_(ss, opts) {
  opts = opts || {};
  const sh = sheet_(ss, SHEET.payment);
  let pay = readTable_(sh);
  if (!isStatusMode_(pay)) throw new Error('先にメニューの「受領管理をステータス形式に変換」を実行してください');
  const added = addMissingRows_(ss);
  pay = readTable_(sh);
  const months = monthColumns_(pay);
  checkMonthColumns_(months);

  const hdr = pay.headerRow;
  const first = hdr + 1;
  const lastRow = Math.max(sh.getLastRow(), first);
  const bodyRows = sh.getMaxRows() - hdr;
  const m0 = months[0].index + 1;
  const mA = colLetter_(m0);
  const mZ = colLetter_(months[months.length - 1].index + 1);
  const P = paidArray_();
  const hdrRange = mA + '$' + hdr + ':' + mZ + '$' + hdr;

  // プルダウンと色分け
  const monthRange = applyStatusValidation_(sh, pay);
  monthRange.setHorizontalAlignment('center');
  const rules = STATUS.list.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s)
      .setBackground(STATUS.colors[s][0]).setFontColor(STATUS.colors[s][1]).setRanges([monthRange]).build();
  });
  sh.setConditionalFormatRules(rules);
  if (pay.col.method !== undefined) {
    sh.getRange(first, pay.col.method + 1, bodyRows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(PAY_METHODS, true).setAllowInvalid(true).build());
  }

  // 上の集計行（見出し行の2行上まで）
  const top = hdr - PAY_SUMMARY_ROWS.length - 1;
  if (top >= 1) {
    const labelCol = m0 - 1;
    sh.getRange(top, labelCol, PAY_SUMMARY_ROWS.length, 1)
      .setValues(PAY_SUMMARY_ROWS.map(function (l) { return [l]; }))
      .setHorizontalAlignment('right').setFontWeight('bold');
    PAY_SUMMARY_ROWS.forEach(function (l, i) {
      const c = STATUS.colors[l];
      if (c) sh.getRange(top + i, labelCol).setBackground(c[0]).setFontColor(c[1]);
    });
    sh.getRange(top, 2).setValue('月ごとの集計（人数）→').setFontWeight('bold');
    sh.getRange(top, m0, PAY_SUMMARY_ROWS.length, months.length).setFormulas(PAY_SUMMARY_ROWS.map(function (l) {
      return months.map(function (m) {
        const L = colLetter_(m.index + 1);
        const col = L + first + ':' + L;
        return l === '入金済み計' ? '=SUM(COUNTIF(' + col + ',' + P + '))' : '=COUNTIF(' + col + ',"' + l + '")';
      });
    })).setHorizontalAlignment('center').setFontWeight('bold');
  }

  // 行ごとの数式：入金月数・最終入金月・対象月チェック
  const hasNo = {};
  pay.rows.forEach(function (r) { hasNo[r.rowNumber] = true; });
  const writeRowFormulas = function (idx, fn) {
    if (idx === undefined) return;
    const out = [];
    for (let r = first; r <= lastRow; r++) out.push([hasNo[r] ? fn(r) : '']);
    sh.getRange(first, idx + 1, out.length, 1).setFormulas(out);
  };
  const monthRef = opts.monthRef || targetMonthRef_(ss, sh, pay);
  writeRowFormulas(pay.col.paidCount, function (r) { return '=SUM(COUNTIF(' + mA + r + ':' + mZ + r + ',' + P + '))'; });
  writeRowFormulas(pay.col.lastPaid, function (r) {
    return '=IFERROR(ARRAYFORMULA(LOOKUP(2,1/ISNUMBER(MATCH(' + mA + r + ':' + mZ + r + ',' + P + ',0)),' + hdrRange + ')),"")';
  });
  writeRowFormulas(pay.col.targetCheck, function (r) {
    return '=IFERROR(ISNUMBER(MATCH(INDEX(' + mA + r + ':' + mZ + r + ',MATCH(' + monthRef + ',' + hdrRange + ',0)),' + P + ',0)),FALSE)';
  });

  fixLedgerFormulas_(ss, pay);
  rebuildMonthlyTrend_(ss, pay);
  sh.setFrozenRows(hdr);
  sh.setFrozenColumns(2);
  if (ss.getSheetByName(DASH.sheet)) buildPaymentDashboard_(ss);
  return { added: added.payment, addedPersonal: added.personal, duplicates: duplicateNos_(ss) };
}

/** 月の列（全行）のプルダウンを今の STATUS.list にする。その範囲を返す */
function applyStatusValidation_(sh, pay) {
  const months = monthColumns_(pay);
  const range = sh.getRange(pay.headerRow + 1, months[0].index + 1, sh.getMaxRows() - pay.headerRow, months.length);
  range.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS.list, true).setAllowInvalid(false).build());
  return range;
}

/** 対象月チェック列が見る対象月のセル：入金ダッシュボードのB4 → 今の数式が見ているセル → ダッシュボードのB4 */
function targetMonthRef_(ss, sh, pay) {
  if (ss.getSheetByName(DASH.sheet)) return "'" + DASH.sheet + "'!$B$4";
  if (pay.col.targetCheck !== undefined && pay.rows.length) {
    const f = String(sh.getRange(pay.rows[0].rowNumber, pay.col.targetCheck + 1).getFormula() || '');
    const m = f.match(/MATCH\(\s*([^,]+?)\s*,/);
    if (m && m[1].indexOf('!') >= 0) return m[1];
  }
  return "'" + DASH.sheet + "'!$B$4";
}

function checkMonthColumns_(months) {
  if (!months.length) throw new Error('20_受領管理 に月の列（YYYY/MM）が見つかりません');
  for (let i = 1; i < months.length; i++) {
    if (months[i].index !== months[i - 1].index + 1) {
      throw new Error('20_受領管理 の月の列が「' + months[i - 1].ym + '」と「' + months[i].ym + '」の間で途切れています。月の列は左から順に並べてください');
    }
  }
}

/** 台帳にいて受領管理・個人情報にいない人の行を足す */
function addMissingRows_(ss) {
  const ledger = readTable_(sheet_(ss, SHEET.ledger));
  const out = { payment: [], personal: [] };
  [[SHEET.payment, 'payment'], [SHEET.personal, 'personal']].forEach(function (pair) {
    const sh = sheet_(ss, pair[0]);
    const have = rowsByNo_(readTable_(sh));
    const seen = {};
    ledger.rows.forEach(function (row) {
      const no = toNo_(row.values[0]);
      if (no === null || have[no] || seen[no]) return;
      seen[no] = true;
      const fullName = (String(cell_(ledger, row, 'lastName')).trim() + ' ' + String(cell_(ledger, row, 'firstName')).trim()).trim();
      const data = pair[1] === 'payment'
        ? { no: no, fullName: fullName, office: String(cell_(ledger, row, 'office')), start: normYm_(cell_(ledger, row, 'start')), paidCount: 0, lastPaid: '' }
        : { no: no, fullName: fullName };
      appendRecord_(sh, data, { uncheckMonths: pair[1] === 'payment' });
      out[pair[1]].push(no);
    });
  });
  return out;
}

/** 台帳の入金月数・最終入金月・ステータス・銀行情報登録を、ANNIN No. で探す数式にする */
function fixLedgerFormulas_(ss, pay) {
  const sh = sheet_(ss, SHEET.ledger);
  const led = readTable_(sh);
  if (!led.rows.length) return;
  const R = "'" + SHEET.payment + "'!";
  const whole = function (table, prefix, key) { const c = colLetter_(table.col[key] + 1); return prefix + '$' + c + ':$' + c; };
  const find = function (r, prefix) { return 'MATCH($A' + r + ',' + prefix + '$A:$A,0)'; };
  const first = led.rows[0].rowNumber;
  const last = led.rows[led.rows.length - 1].rowNumber;
  const hasNo = {};
  led.rows.forEach(function (r) { hasNo[r.rowNumber] = true; });
  const write = function (key, fn) {
    if (led.col[key] === undefined) return;
    const out = [];
    for (let r = first; r <= last; r++) out.push([hasNo[r] ? fn(r) : '']);
    sh.getRange(first, led.col[key] + 1, out.length, 1).setFormulas(out);
  };
  if (pay.col.paidCount !== undefined) {
    write('paidCount', function (r) { return '=IFERROR(INDEX(' + whole(pay, R, 'paidCount') + ',' + find(r, R) + '),0)'; });
  }
  if (pay.col.lastPaid !== undefined) {
    write('lastPaid', function (r) { return '=IFERROR(INDEX(' + whole(pay, R, 'lastPaid') + ',' + find(r, R) + '),"")'; });
  }
  if (pay.col.targetCheck !== undefined && led.col.cancel !== undefined) {
    const cancel = colLetter_(led.col.cancel + 1);
    write('status', function (r) {
      return '=IF($' + cancel + r + '=TRUE,"退会",IF(IFERROR(INDEX(' + whole(pay, R, 'targetCheck') + ',' + find(r, R) + '),FALSE)=TRUE,"課金中","要確認"))';
    });
  }
  const personal = readTable_(sheet_(ss, SHEET.personal));
  if (personal.col.bankName !== undefined) {
    const P = "'" + SHEET.personal + "'!";
    write('bank', function (r) { return '=IF(IFERROR(INDEX(' + whole(personal, P, 'bankName') + ',' + find(r, P) + '),"")<>"","済","未登録")'; });
  }
}

/** 50_月次推移：月ごとの入金済み数（チェックの TRUE・入金済みのステータスを数える） */
function rebuildMonthlyTrend_(ss, pay) {
  const sh = ss.getSheetByName('50_月次推移');
  if (!sh) return;
  const months = monthColumns_(pay);
  const R = "'" + SHEET.payment + "'!";
  const first = pay.headerRow + 1;
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).clearContent();
  sh.getRange(1, 1, 1, 3).setValues([['年月', '受領者数', '前月差']]);
  sh.getRange(2, 1, months.length, 1).setNumberFormat('@').setValues(months.map(function (m) { return [m.ym]; }));
  sh.getRange(2, 2, months.length, 2).setFormulas(months.map(function (m, i) {
    const L = colLetter_(m.index + 1);
    const col = R + L + first + ':' + L;
    return ['=COUNTIF(' + col + ',TRUE)+SUM(COUNTIF(' + col + ',' + paidArray_() + '))', i === 0 ? '' : '=B' + (i + 2) + '-B' + (i + 1)];
  }));
}

/** 台帳で重複している ANNIN No. */
function duplicateNos_(ss) {
  const seen = {};
  const dups = [];
  readTable_(sheet_(ss, SHEET.ledger)).rows.forEach(function (row) {
    const no = toNo_(row.values[0]);
    if (seen[no] && dups.indexOf(no) < 0) dups.push(no);
    seen[no] = true;
  });
  return dups;
}

/** 受領管理の最後の月の右に n ヶ月分の列を足す（ステータス形式のみ） */
function addMonths_(ss, n) {
  const sh = sheet_(ss, SHEET.payment);
  const pay = readTable_(sh);
  if (!isStatusMode_(pay)) throw new Error('先にメニューの「受領管理をステータス形式に変換」を実行してください');
  const months = monthColumns_(pay);
  checkMonthColumns_(months);
  const lastM = months[months.length - 1];
  const labels = [];
  let ym = lastM.ym;
  for (let i = 0; i < n; i++) { ym = nextYm_(ym); labels.push(ym); }
  sh.insertColumnsAfter(lastM.index + 1, n);
  const head = sh.getRange(pay.headerRow, lastM.index + 2, 1, n);
  sh.getRange(pay.headerRow, lastM.index + 1).copyTo(head, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  head.setNumberFormat('@').setValues([labels]);
  refreshPaymentSheet_(ss);
  return labels;
}

function nextYm_(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 12 ? (y + 1) + '/01' : y + '/' + ('0' + (m + 1)).slice(-2);
}

// ===== 入金ダッシュボード ===================================================
//
// メニュー「ANNIN管理 → 入金ダッシュボードを作成・更新」で、次の2シートを作る（何度実行しても安全）。
//   - 01_入金ダッシュボード … 対象月（空欄なら今月）の入金数・未入金数・入金率・事務所別・未入金者一覧・月別推移
//   - _入金集計（非表示）   … ダッシュボードの計算用。20_受領管理・10_タレント台帳を数式で参照する
// 中身はすべて数式なので、アプリやシートでステータス（チェック）を入れるとすぐに反映される。
// 「入金済み」は、チェックボックスの TRUE か、STATUS.paid のステータス（振込・サブスク）。
// 「入金対象」は、解約しておらず開始月が来ていて、その月のステータスが STATUS.excluded（当月開始・休止・退所・クーオフ）でない人。

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
  const P = paidArray_();
  const paidTest = function (x) { return '((' + x + '=TRUE)+ISNUMBER(MATCH(' + x + ',' + P + ',0))>0)'; };
  const statusMode = isStatusMode_(pay);
  // 最終入金月：月の列から直接求める（いちばん右の入金済みの月）
  const months = monthColumns_(pay);
  const mFirst = colLetter_(months[0].index + 1);
  const mLast = colLetter_(months[months.length - 1].index + 1);
  const mHdr = R + mFirst + pay.headerRow + ':' + mLast + pay.headerRow;
  const lastPaidFormula = '=BYROW(' + R + mFirst + first + ':' + mLast + ',LAMBDA(r,IFERROR('
    + 'INDEX(ARRAYFORMULA(' + ymText(mHdr) + '),1,MAX(FILTER(SEQUENCE(1,COLUMNS(r)),' + paidTest('r') + '))),"")))';

  // 2つのシートを先に用意する（お互いを数式で参照するため）
  let sh = ss.getSheetByName(DASH.sheet);
  const isNew = !sh;
  if (isNew) sh = ss.insertSheet(DASH.sheet, 1);
  let calc = ss.getSheetByName(DASH.calc);
  if (!calc) calc = ss.insertSheet(DASH.calc);
  calc.clear();
  const needRows = paySheet.getMaxRows() + 1000;
  if (calc.getMaxRows() < needRows) calc.insertRowsAfter(calc.getMaxRows(), needRows - calc.getMaxRows());
  calc.getRange(1, 1, 1, 11).setValues([['ANNIN No.', '姓名', '所属事務所', '開始年月', '入金月数', '最終入金月', '開始(数値)', '解約', '対象月入金', '前月入金', '対象月ステータス']]);
  // N列：支払方法（L:M は対象月などの計算用セル）
  if (statusMode) {
    calc.getRange('N1').setValue('支払方法');
    calc.getRange('N2').setFormula(ifRow('TRIM(TO_TEXT(' + rng('method') + '))'));
  }
  const monthCell = function (n) { return 'INDEX(' + body + ',0,MAX(1,$M$' + n + '))'; };
  calc.getRange(2, 1, 1, 11).setFormulas([[
    ifRow(noR),
    ifRow(rng('fullName')),
    ifRow(rng('office')),
    ifRow(ymText(rng('start'))),
    pay.col.paidCount === undefined ? '' : ifRow(rng('paidCount')),
    lastPaidFormula,
    ifRow('IFERROR(VALUE(SUBSTITUTE(' + ymText(rng('start')) + ',"/","")),0)'),
    ifRow(cancel),
    ifRow('IF($M$5=0,FALSE,' + paidTest(monthCell(5)) + ')'),
    ifRow('IF($M$6=0,FALSE,' + paidTest(monthCell(6)) + ')'),
    ifRow('IF($M$5=0,"",IF(' + monthCell(5) + '=TRUE,"' + PAID_DEFAULT + '",IF(' + monthCell(5) + '=FALSE,"",TO_TEXT(' + monthCell(5) + '))))'),
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
  const excluded = STATUS.excluded.map(function (st) { return ',' + col('K') + ',"<>' + st + '"'; }).join('');
  const target = 'COUNTIFS(' + col('A') + ',"<>",' + col('H') + ',FALSE,' + col('G') + ',"<="&' + C + '$M$2' + excluded;
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
    ['入金対象（在籍・開始済み）', '=' + target + ')', '解約しておらず開始月が来ている人（その月が ' + STATUS.excluded.join('・') + ' の人は除く）'],
    ['入金済み', '=COUNTIF(' + col('I') + ',TRUE)', '対象月が ' + STATUS.paid.join('・') + ' の人'],
    ['未入金', '=' + target + ',' + col('I') + ',FALSE)', '入金対象のうち入金済みでない人（右の一覧）'],
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

  let tStart = 21 + offices.length + 1;
  if (statusMode) {
    sh.getRange(tStart, 1).setValue('■ ステータス別（対象月）').setFontWeight('bold');
    sh.getRange(tStart + 1, 1, 1, 2).setValues([['ステータス', '人数']]).setFontWeight('bold').setBackground('#eef3fe');
    const st = STATUS.list.concat(['（未入力）']);
    sh.getRange(tStart + 2, 1, st.length, 1).setValues(st.map(function (x) { return [x]; }));
    sh.getRange(tStart + 2, 2, st.length, 1).setFormulas(st.map(function (x) {
      return [x === '（未入力）'
        ? '=COUNTIFS(' + col('A') + ',"<>",' + col('H') + ',FALSE,' + col('G') + ',"<="&' + C + '$M$2,' + col('K') + ',"")'
        : '=COUNTIF(' + col('K') + ',"' + x + '")'];
    })).setNumberFormat('#,##0');
    STATUS.list.forEach(function (x, i) {
      sh.getRange(tStart + 2 + i, 1).setBackground(STATUS.colors[x][0]).setFontColor(STATUS.colors[x][1]);
    });
    sh.getRange(tStart + 2 + STATUS.list.length, 3).setValue('在籍・開始済みで、対象月のステータスが空欄の人').setFontColor('#656d76');
    tStart += st.length + 3;

    // 支払方法別：対象月の入金済み（振込・サブスク）を、20_受領管理の「支払方法」で分ける
    sh.getRange(tStart, 1).setValue('■ 支払方法別（対象月の入金済み）').setFontWeight('bold');
    const headers = ['支払方法'].concat(STATUS.paid, ['合計']);
    sh.getRange(tStart + 1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#eef3fe');
    const methods = PAY_METHODS.concat(['（未設定）']);
    const mRow0 = tStart + 2;
    sh.getRange(mRow0, 1, methods.length + 1, 1).setValues(methods.concat(['合計']).map(function (x) { return [x]; }));
    const lastC = colLetter_(1 + STATUS.paid.length);
    sh.getRange(mRow0, 2, methods.length + 1, STATUS.paid.length + 1).setFormulas(methods.concat(['合計']).map(function (m, i) {
      const r = mRow0 + i;
      if (m === '合計') {
        return STATUS.paid.concat(['']).map(function (_, j) {
          const L = colLetter_(2 + j);
          return '=SUM(' + L + mRow0 + ':' + L + (r - 1) + ')';
        });
      }
      const cond = ',' + col('N') + ',"' + (m === '（未設定）' ? '' : m) + '"';
      return STATUS.paid.map(function (p) { return '=COUNTIFS(' + col('K') + ',"' + p + '"' + cond + ')'; })
        .concat(['=SUM(B' + r + ':' + lastC + r + ')']);
    })).setNumberFormat('#,##0');
    sh.getRange(mRow0 + methods.length, 1, 1, headers.length).setFontWeight('bold');
    sh.getRange(mRow0, headers.length + 1).setValue('支払方法は 20_受領管理 の「支払方法」列（人ごと）で分けています').setFontColor('#656d76');
    tStart += methods.length + 4;
  }
  sh.getRange(tStart, 1).setValue('■ 月別の入金済み数（直近12ヶ月）').setFontWeight('bold');
  sh.getRange(tStart + 1, 1, 1, 3).setValues([['年月', '入金済み', '前月差']]).setFontWeight('bold').setBackground('#eef3fe');
  const trend = [];
  for (let i = 0; i < 12; i++) {
    const r = tStart + 2 + i;
    trend.push([
      '=TEXT(EDATE(DATE(LEFT($B$4,4),RIGHT($B$4,2),1),' + (i - 11) + '),"yyyy/mm")',
      (function () {
        const x = 'INDEX(' + body + ',0,MATCH(A' + r + ',' + hdrNorm + ',0))';
        return '=IFERROR(COUNTIF(' + x + ',TRUE)+SUM(COUNTIF(' + x + ',' + P + ')),"")';
      })(),
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
  sh.getRange('G8:M8').setValues([['ANNIN No.', '姓名', '所属', '開始年月', '入金月数', '最終入金月', 'ステータス']]).setFontWeight('bold').setBackground('#fdecea');
  const notExcluded = STATUS.excluded.map(function (st) { return ',' + col('K') + '<>"' + st + '"'; }).join('');
  sh.getRange('G9').setFormula('=IFERROR(SORT(FILTER({' + C + 'A2:F,' + C + 'K2:K},' + col('A') + '<>"",' + col('H') + '=FALSE,' + col('G') + '<=' + C + '$M$2,' + col('I') + '=FALSE' + notExcluded + '),1,TRUE),"未入金者はいません")');

  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 300);
  sh.setColumnWidths(4, 3, 80);
  sh.setColumnWidth(6, 24);
  sh.setColumnWidths(7, 7, 95);
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
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'yyyy/MM');
  const m = toHalf_(String(v === null || v === undefined ? '' : v)).match(/(\d{4})\s*[\/\-年.]\s*(\d{1,2})/);
  if (!m) return '';
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return '';
  return m[1] + '/' + ('0' + mo).slice(-2);
}

function currentYm_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM');
}

/**
 * スプレッドシートのタイムゾーン。シートの日付はこのタイムゾーンで読み書きする
 * （スクリプトと違うタイムゾーンで日付を作ると、2026/10/01 が 2026/09/30 になるため）。
 */
let TZ_CACHE_ = '';
function tz_() {
  if (TZ_CACHE_) return TZ_CACHE_;
  try {
    TZ_CACHE_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Tokyo';
  } catch (e) {
    TZ_CACHE_ = 'Asia/Tokyo';
  }
  return TZ_CACHE_;
}

/** "2026/10" → スプレッドシートのタイムゾーンで 2026/10/01 0:00 の日付 */
function ymToDate_(ym) {
  return Utilities.parseDate(ym + '/01', tz_(), 'yyyy/MM/dd');
}

/** 着金日などの日付 → "2026/10/05"（文字列はそのまま） */
function fmtDay_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'yyyy/MM/dd');
  return String(v === null || v === undefined ? '' : v).trim();
}

/** 月のセルの値が「入金済み」か（チェックボックスの TRUE か、STATUS.paid のステータス） */
function isPaidValue_(v) {
  return v === true || (typeof v === 'string' && STATUS.paid.indexOf(statusOf_(v)) >= 0);
}

/** 月のセルの値 → ステータス文字列（チェックボックスの TRUE は「振込」、FALSE は空欄、以前の名前は今の名前） */
function statusOf_(v) {
  if (v === true) return PAID_DEFAULT;
  if (v === false || v === null || v === undefined) return '';
  const s = String(v).trim();
  return STATUS.renamed[s] || s;
}

/** 受領管理がステータス形式（変換済み）か。変換すると「支払方法」の列ができる */
function isStatusMode_(table) {
  return table.col.method !== undefined;
}

/** 数式に埋め込む、入金済みのステータスの配列 {"振込","サブスク","入金あり"}（以前の名前も入金済みとして数える） */
function paidArray_() {
  const old = Object.keys(STATUS.renamed).filter(function (k) { return STATUS.paid.indexOf(STATUS.renamed[k]) >= 0; });
  return '{' + STATUS.paid.concat(old).map(function (s) { return '"' + s + '"'; }).join(',') + '}';
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
  .seg { display:flex; flex-wrap:wrap; gap:8px; }
  .seg label { flex:1 1 40%; margin:0; padding:9px; border:1px solid var(--line); border-radius:6px; text-align:center; color:var(--text); cursor:pointer; font-size:15px; }
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
  .badge { display:inline-block; white-space:nowrap; padding:2px 8px; border-radius:999px; font-size:13px; font-weight:600; border:1px solid var(--line); }
  .person { border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-top:8px; }
  .person .top { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
  .controls { display:grid; grid-template-columns:1.2fr 1fr 1.2fr auto; gap:6px; margin-top:8px; align-items:end; }
  .controls select, .controls input { padding:7px 8px; font-size:15px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .chips button { padding:5px 10px; border-radius:999px; border:1px solid var(--line); font-size:13px; cursor:pointer; }
  .note { background:#fff8e1; color:#7a5b00; padding:8px 10px; border-radius:8px; font-size:13px; margin-bottom:10px; }
  @media (max-width:520px) { .controls { grid-template-columns:1fr 1fr; } }
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
        <div><label>支払方法（任意）</label><select name="method" id="methodSel"><option value="">－</option></select></div>
        <div class="full"><label>⑤ 開始月の入金（登録と同時に 20_受領管理 の開始月に入ります）</label><div class="seg" id="startPaySeg"></div></div>
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
    <div class="note" id="modeNote" style="display:none">20_受領管理はまだチェックボックス形式です。振込・サブスクは「チェックあり」、それ以外は「チェックなし」として記録されます（支払方法・着金日は記録されません）。メニュー「ANNIN管理 → 受領管理をステータス形式に変換」を実行すると、ステータスのまま記録できます。</div>
    <div class="card">
      <h2>探して入力</h2>
      <div class="row">
        <div><label>対象月</label><select id="monthSel" onchange="if(lastResults.length)doSearch()"></select></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div><label>ANNIN No. または 名前・カナ</label><input id="q" placeholder="例：123 / 山田 / ヤマダ" onkeydown="if(event.key==='Enter'){event.preventDefault();doSearch();}"></div>
        <button class="btn" type="button" onclick="doSearch()">検索</button>
      </div>
      <div id="results" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <h2>まとめて入力</h2>
      <label>ANNIN No.（改行・カンマ・空白区切りで貼り付け）</label>
      <textarea id="bulk" placeholder="12&#10;45&#10;1203"></textarea>
      <div class="chips" id="bulkPresets"></div>
      <div class="grid" style="margin-top:10px">
        <div><label>ステータス</label><select id="bulkStatus" onchange="if(this.value!=='振込')document.getElementById('bulkMethod').value=''"></select></div>
        <div><label>支払方法（任意）</label><select id="bulkMethod"></select></div>
        <div><label>着金日（任意）</label><input id="bulkDate" type="date"></div>
      </div>
      <div style="margin-top:10px"><button class="btn" type="button" id="bulkBtn" onclick="doBulk()">対象月にまとめて入れる</button></div>
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
  document.getElementById('methodSel').innerHTML += d.methods.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
  document.getElementById('startPaySeg').innerHTML = d.startPayments.map(function (x, i) {
    return '<label><input type="radio" name="startPayment" value="' + esc(x.key) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(x.label) + '</span></label>';
  }).join('');
  document.getElementById('bulkStatus').innerHTML = statusOptions('振込', false);
  document.getElementById('bulkMethod').innerHTML = methodOptions(d.statusMode ? '振込' : '');
  document.getElementById('bulkPresets').innerHTML = QUICK.slice(0, 2).map(function (q, k) {
    var c = d.statusColors[q.status];
    return '<button type="button" style="background:' + c[0] + ';color:' + c[1] + '" onclick="bulkPreset(' + k + ')">' + esc(q.label) + 'にする</button>';
  }).join('');
  document.getElementById('modeNote').style.display = d.statusMode ? 'none' : '';
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
    showMsg('登録しました：ANNIN No. ' + res.no + '　' + res.fullName + (res.startNote ? '\\n' + res.startNote : ''), true);
    document.getElementById('pane-reg').reset();
    document.querySelector('[name=start]').value = INIT.currentMonth.replace('/', '-');
    document.getElementById('nextNoHint').textContent = '次の番号：' + res.nextNo + '（既存の番号とかぶらないように自動で振ります）';
  }, function () { btn.disabled = false; btn.textContent = 'スプレッドシートに登録'; });
}

function month() { return document.getElementById('monthSel').value; }

function statusOptions(selected, withBlank) {
  return (withBlank ? '<option value="">（空欄）</option>' : '') + INIT.statuses.map(function (s) {
    return '<option' + (s === selected ? ' selected' : '') + '>' + esc(s) + '</option>';
  }).join('');
}
function methodOptions(selected) {
  return '<option value="">支払方法：変えない</option>' + INIT.methods.map(function (m) {
    return '<option' + (m === selected ? ' selected' : '') + '>' + esc(m) + '</option>';
  }).join('');
}
function badge(status) {
  if (!status) return '<span class="badge" style="color:var(--muted)">未入力</span>';
  var c = INIT.statusColors[status] || ['#fff', '#1f2328'];
  return '<span class="badge" style="background:' + c[0] + ';color:' + c[1] + ';border-color:' + c[0] + '">' + esc(status) + '</span>';
}
function today() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

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
  box.innerHTML = '<div class="small">' + esc(month()) + ' のステータス（' + list.length + '件' + (list.length >= 50 ? '・先頭50件' : '') + '）</div>' +
    list.map(function (r, i) {
      var head = '<div class="top"><div><b>No.' + r.no + '　' + esc(r.name) + '</b><div class="small">' + esc(r.kana) + '　' + esc(r.office) +
        '　' + esc(r.start) + '開始　入金' + r.paidCount + 'ヶ月　' + esc(r.status) + (r.method ? '　' + esc(r.method) : '') + '</div></div>' +
        '<div>' + esc(month()) + '<br>' + badge(r.monthStatus) + '</div></div>';
      if (!r.inPayment) return '<div class="person">' + head + '<div class="small">20_受領管理に行がありません（メニュー「受領管理の色分け・集計・数式を整える」で追加されます）</div></div>';
      var chips = '<div class="chips">' + QUICK.map(function (q, k) {
        var c = INIT.statusColors[q.status];
        return '<button type="button" style="background:' + c[0] + ';color:' + c[1] + '" onclick="quickSet(' + i + ',' + k + ')">' + esc(q.label) + '</button>';
      }).join('') + '</div>';
      var controls = '<div class="controls">' +
        '<select id="st' + i + '">' + statusOptions(r.monthStatus || '振込', true) + '</select>' +
        '<select id="me' + i + '"' + (INIT.statusMode ? '' : ' disabled') + '>' + methodOptions('') + '</select>' +
        '<input id="dt' + i + '" type="date"' + (INIT.statusMode ? '' : ' disabled') + ' title="着金日（任意）">' +
        '<button class="btn" type="button" style="padding:8px 14px" onclick="saveRow(' + i + ')">保存</button></div>';
      return '<div class="person">' + head + chips + controls + '</div>';
    }).join('');
}

// 「振込」＝その月を振込＋支払方法を振込にする。ほかはステータスだけ
var QUICK = [
  { label: '振込', status: '振込', method: '振込' },
  { label: 'サブスク', status: 'サブスク', method: '' },
  { label: '未入金', status: '未入金', method: '' },
  { label: '休止', status: '休止', method: '' },
  { label: '退所', status: '退所', method: '' },
];
function bulkPreset(k) {
  document.getElementById('bulkStatus').value = QUICK[k].status;
  document.getElementById('bulkMethod').value = INIT.statusMode ? QUICK[k].method : '';
}
function quickSet(i, k) {
  document.getElementById('st' + i).value = QUICK[k].status;
  if (INIT.statusMode && QUICK[k].method) document.getElementById('me' + i).value = QUICK[k].method;
  saveRow(i);
}

function saveRow(i) {
  var r = lastResults[i];
  var status = document.getElementById('st' + i).value;
  var extra = { method: document.getElementById('me' + i).value, date: document.getElementById('dt' + i).value };
  if (!status && !confirm('No.' + r.no + ' ' + r.name + ' の ' + month() + ' を空欄に戻しますか？')) return;
  call('setPayment', [r.no, month(), status, extra], function (res) {
    showMsg('No.' + r.no + ' ' + r.name + '：' + month() + ' を「' + (status || '空欄') + '」にしました' + (res.done.length ? '' : '（変更なし）'), true);
    doSearch();
  });
}

function doBulk() {
  clearMsg();
  var text = document.getElementById('bulk').value;
  var btn = document.getElementById('bulkBtn');
  var status = document.getElementById('bulkStatus').value;
  var extra = { method: document.getElementById('bulkMethod').value, date: document.getElementById('bulkDate').value };
  if (!confirm(month() + ' に「' + status + '」をまとめて入れます。よろしいですか？')) return;
  btn.disabled = true;
  call('setPaymentsBulk', [text, month(), status, extra], function (res) {
    var lines = [res.month + '：' + res.done.length + '件を「' + res.status + '」にしました'];
    if (res.done.length) lines.push('　→ ' + res.done.join(', '));
    if (res.already.length) lines.push('すでに「' + res.status + '」：' + res.already.join(', '));
    if (res.notFound.length) lines.push('見つからない番号：' + res.notFound.join(', '));
    showMsg(lines.join('\\n'), res.notFound.length === 0);
    if (!res.notFound.length) document.getElementById('bulk').value = '';
  }, function () { btn.disabled = false; });
}

call('getInitData', [], init);
</script>
</body>
</html>`;
