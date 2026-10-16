// ANNIN_登録入金.gs のテスト（`node --test annin-talent/tests`）
// SpreadsheetApp などの Apps Script のサービスは最小限のモックで置き換える。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'ANNIN_登録入金.gs'), 'utf8');

class FakeRange {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  each(fn) {
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) fn(this.row - 1 + r, this.col - 1 + c, r, c);
  }
  getValues() {
    const out = Array.from({ length: this.nr }, () => []);
    this.each((R, C, r) => {
      const v = (this.sheet.cells[R] || [])[C];
      out[r].push(v === undefined ? '' : v);
    });
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    this.each((R, C, r, c) => this.sheet.set(R, C, values[r][c]));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  getFormula() { return this.sheet.formulas[`${this.row - 1},${this.col - 1}`] || ''; }
  getFormulasR1C1() {
    const out = Array.from({ length: this.nr }, () => []);
    this.each((R, C, r) => out[r].push(this.sheet.formulas[`${R},${C}`] || ''));
    return out;
  }
  setFormulaR1C1(f) { this.sheet.formulas[`${this.row - 1},${this.col - 1}`] = f; return this; }
  setNumberFormat(fmt) { this.each((R, C) => (this.sheet.formats[`${R},${C}`] = fmt)); return this; }
  copyTo(target) { this.sheet.copies.push([this.row, target.row]); }
}
class FakeSheet {
  constructor(name, cells, formulas = {}) {
    this.name = name;
    this.cells = cells.map((r) => r.slice());
    this.formulas = formulas;
    this.formats = {};
    this.copies = [];
    this.maxRows = 100;
  }
  set(R, C, v) { (this.cells[R] || (this.cells[R] = []))[C] = v; }
  getName() { return this.name; }
  getRange(row, col, nr = 1, nc = 1) { return new FakeRange(this, row, col, nr, nc); }
  getLastRow() {
    for (let r = this.cells.length - 1; r >= 0; r--) if ((this.cells[r] || []).some((v) => v !== '' && v !== undefined)) return r + 1;
    return 0;
  }
  getLastColumn() { return Math.max(...this.cells.map((r) => (r || []).length)); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_, n) { this.maxRows += n; }
}

const MONTHS = ['2026/08', '2026/09', '2026/10'];
function makeSpreadsheet() {
  const ledger = new FakeSheet('10_タレント台帳', [
    ['ANNIN No.', '姓', '名', '姓（カナ）', '名（カナ）', '性別', '開始年月', '所属事務所', '入金月数', '最終入金月', '銀行情報登録', '解約', 'ステータス', '備考'],
    [1, '本間', '匠', '', 'ホンマ　タクミ', '男', '2024/05', '東京', 2, '', '済', true, '退会', ''],
    [2, '山本', '心愛', 'ヤマモト', 'ココナ', '女', '2024/05', '大阪', 1, '', '済', false, '', ''],
  ], { '2,12': '=IF(R[0]C[-1],"退会","課金中")' });
  const payment = new FakeSheet('20_受領管理', [
    ['ANNIN No.', '姓名', '所属事務所', '開始年月', ...MONTHS, '入金月数', '最終入金月', '対象月チェック'],
    [1, '本間 匠', '東京', '2024/05', true, true, false, 2, '', false],
    [2, '山本 心愛', '大阪', '2024/05', false, true, false, 1, '', true],
  ], { '1,7': '=COUNTIF(R[0]C[-3]:R[0]C[-1],TRUE)', '2,7': '=COUNTIF(R[0]C[-3]:R[0]C[-1],TRUE)' });
  const personal = new FakeSheet('30_個人情報（銀行口座）', [
    ['※このシートは個人情報・口座情報を含みます'],
    ['ANNIN No.', '姓名', '郵便番号', '住所', '電話番号', '続柄', '銀行名', '支店名', '区分', '口座名義', '口座番号'],
    [1, '本間 匠', '', '', '', '', '三菱UFJ銀行', '上尾支店', '普通口座', 'ホンマタクミ', '141216'],
    [5, '山本 心愛', '', '', '', '', '', '', '', '', ''],
  ]);
  const sheets = { [ledger.name]: ledger, [payment.name]: payment, [personal.name]: personal };
  return { sheets, ledger, payment, personal, getSheetByName: (n) => sheets[n] || null };
}

function load(ss) {
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: () => {},
      CopyPasteType: { PASTE_FORMAT: 'f', PASTE_DATA_VALIDATION: 'v' },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate: () => '2026/10' },
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return ctx;
}

const FORM = {
  no: '', lastName: '田中', firstName: '花子', lastKana: 'たなか', firstKana: 'ハナコ', office: '大阪', start: '2026/10',
  zip: '５３０－０００１', address: '大阪府大阪市北区1-1', phone: '', bankName: 'ゆうちょ銀行', branch: '〇一八',
  accountType: '普通口座', holder: 'タナカハナコ', accountNo: '0123456',
};

test('次の ANNIN No. は3シートすべての最大値＋1（個人情報シートだけにある番号ともかぶらない）', () => {
  const ss = makeSpreadsheet();
  assert.equal(load(ss).getInitData().nextNo, 6);
  assert.deepEqual([...load(ss).getInitData().months], MONTHS);
});

test('新規登録で3シートに1行ずつ追加され、数式は上の行から引き継ぐ', () => {
  const ss = makeSpreadsheet();
  const ctx = load(ss);
  const res = ctx.registerTalent(FORM);
  assert.equal(res.ok, true);
  assert.equal(res.no, 6);
  assert.equal(res.nextNo, 7);

  const l = ss.ledger.cells[3];
  assert.deepEqual(l.slice(0, 8), [6, '田中', '花子', 'タナカ', 'ハナコ', '', '2026/10', '大阪']);
  assert.equal(l[10], '済');
  assert.equal(l[11], false);
  assert.equal(ss.ledger.formulas['3,12'], '=IF(R[0]C[-1],"退会","課金中")');
  assert.equal(ss.ledger.formats['3,6'], '@'); // 開始年月は文字列のまま

  const p = ss.payment.cells[3];
  assert.deepEqual(p.slice(0, 7), [6, '田中 花子', '大阪', '2026/10', false, false, false]);
  assert.equal(ss.payment.formulas['3,7'], '=COUNTIF(R[0]C[-3]:R[0]C[-1],TRUE)');
  assert.equal(p[9], false); // 対象月チェック（ブール）は FALSE

  const pi = ss.personal.cells[4];
  assert.deepEqual(pi, [6, '田中 花子', '530-0001', '大阪府大阪市北区1-1', '', '', 'ゆうちょ銀行', '〇一八', '普通口座', 'タナカハナコ', '0123456']);
  assert.equal(ss.personal.formats['4,10'], '@'); // 口座番号の先頭0を残す
});

test('使用済みの番号を手入力すると登録しない', () => {
  const ss = makeSpreadsheet();
  assert.throws(() => load(ss).registerTalent({ ...FORM, no: '5' }), /すでに使われています/);
  assert.equal(ss.ledger.cells.length, 3);
});

test('同姓同名がいるときは確認を返し、force で登録できる', () => {
  const ss = makeSpreadsheet();
  const ctx = load(ss);
  const form = { ...FORM, lastName: '山本', firstName: '心愛' };
  const res = ctx.registerTalent(form);
  assert.equal(res.ok, false);
  assert.equal(res.duplicates[0].no, 2);
  assert.equal(ctx.registerTalent({ ...form, force: true }).ok, true);
});

test('必須項目のチェック', () => {
  const ss = makeSpreadsheet();
  assert.throws(() => load(ss).registerTalent({ ...FORM, office: '名古屋' }), /所属/);
  assert.throws(() => load(ss).registerTalent({ ...FORM, firstKana: '' }), /読み方/);
});

test('No. と名前・カナで検索でき、対象月の入金状況がつく', () => {
  const ctx = load(makeSpreadsheet());
  const byNo = ctx.searchTalents('2', '2026/09');
  assert.equal(byNo.length, 1);
  assert.equal(byNo[0].paid, true);
  assert.equal(ctx.searchTalents('やまもと', '2026/09')[0].no, 2);
  assert.equal(ctx.searchTalents('ホンマタクミ', '2026/10')[0].paid, false);
  assert.equal(ctx.searchTalents('本間', '2026/10')[0].paidCount, 2);
});

test('入金チェックで受領管理の月の列にチェックが付き、数式でない入金月数・最終入金月は更新される', () => {
  const ss = makeSpreadsheet();
  const ctx = load(ss);
  ctx.setPayment(2, '2026/10', true);
  assert.equal(ss.payment.cells[2][6], true);
  assert.equal(ss.payment.cells[2][7], 1); // 数式の列は触らない
  assert.equal(ss.payment.cells[2][8], '2026/10');
  assert.equal(ss.ledger.cells[2][8], 2);
  assert.equal(ss.ledger.cells[2][9], '2026/10');
  ctx.setPayment(2, '2026/10', false);
  assert.equal(ss.payment.cells[2][6], false);
  assert.equal(ss.ledger.cells[2][9], '2026/09');
});

test('まとめてチェック：済み・見つからない番号を分けて返す', () => {
  const ss = makeSpreadsheet();
  const res = load(ss).setPaymentsBulk('１\n2, 99', '2026/09');
  assert.deepEqual([...res.done], []);
  assert.deepEqual([...res.already], [1, 2]);
  assert.deepEqual([...res.notFound], ['99']);
  const res2 = load(ss).setPaymentsBulk('1 2', '2026/10');
  assert.deepEqual([...res2.done], [1, 2]);
});

test('受領管理にない月はエラー', () => {
  assert.throws(() => load(makeSpreadsheet()).setPayment(1, '2027/01', true), /列がありません/);
});

test('年月の表記ゆれ', () => {
  const ctx = load(makeSpreadsheet());
  assert.equal(ctx.normYm_('2026-1'), '2026/01');
  assert.equal(ctx.normYm_('２０２６年１０月'), '2026/10');
  assert.equal(ctx.normYm_(new Date(2026, 9, 1)), '2026/10');
  assert.equal(ctx.normYm_('開始年月'), '');
});

// ---- 入金ダッシュボード ----
// 数式の計算はできないので、作成が最後まで通ること・数式の括弧と引用符の対応・参照先の列を確認する。
function chain(target) {
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => chain(t);
    },
  });
}
function a1(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  const n = (s) => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
  const c1 = n(m[1]);
  const r1 = Number(m[2]);
  return [r1, c1, (m[4] ? Number(m[4]) : r1) - r1 + 1, (m[3] ? n(m[3]) : c1) - c1 + 1];
}
function withDashboardSupport(ss) {
  const patch = (sh) => {
    const orig = sh.getRange.bind(sh);
    sh.getRange = (r, c, nr, nc) => {
      const range = typeof r === 'string' ? orig(...a1(r)) : orig(r, c, nr, nc);
      range.setFormula = (f) => { sh.formulasA1[`${range.row},${range.col}`] = f; return chain(range); };
      range.setFormulas = (fs) => {
        fs.forEach((line, i) => line.forEach((f, j) => { if (f) sh.formulasA1[`${range.row + i},${range.col + j}`] = f; }));
        return chain(range);
      };
      range.getDisplayValue = () => String(range.getValue());
      return chain(range);
    };
    sh.formulasA1 = {};
    sh.charts = [];
    sh.clear = () => { sh.cells = []; sh.formulasA1 = {}; };
    sh.hideSheet = () => { sh.hidden = true; };
    sh.getCharts = () => sh.charts;
    sh.removeChart = (c) => { sh.charts = sh.charts.filter((x) => x !== c); };
    sh.insertChart = (c) => sh.charts.push(c);
    sh.newChart = () => chain({ build: () => ({}) });
    sh.setColumnWidth = sh.setColumnWidths = sh.setFrozenRows = () => {};
    return sh;
  };
  Object.values(ss.sheets).forEach(patch);
  ss.order = Object.keys(ss.sheets);
  ss.insertSheet = (name, index) => {
    const sh = patch(new FakeSheet(name, []));
    ss.sheets[name] = sh;
    ss.order.splice(index === undefined ? ss.order.length : index, 0, name);
    return sh;
  };
  ss.setActiveSheet = () => {};
  ss.toast = () => {};
  return ss;
}
function loadWithDashboard(ss) {
  const ctx = load(ss);
  ctx.SpreadsheetApp.newDataValidation = () => chain({});
  ctx.Charts = { ChartType: { COLUMN: 'column' } };
  return ctx;
}
function checkFormula(f) {
  let depth = 0;
  let inStr = false;
  let inSheet = false;
  for (const ch of f) {
    if (ch === '"' && !inSheet) inStr = !inStr;
    else if (ch === "'" && !inStr) inSheet = !inSheet;
    else if (!inStr && !inSheet) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      assert.ok(depth >= 0, '閉じ括弧が多い: ' + f);
    }
  }
  assert.equal(depth, 0, '括弧の数が合わない: ' + f);
  assert.ok(!inStr && !inSheet, '引用符が閉じていない: ' + f);
}

test('入金ダッシュボードを作成できる（数式の括弧・参照先）', () => {
  const ss = withDashboardSupport(makeSpreadsheet());
  const ctx = loadWithDashboard(ss);
  ctx.buildPaymentDashboard();
  const dash = ss.sheets['01_入金ダッシュボード'];
  const calc = ss.sheets['_入金集計'];
  assert.equal(ss.order[1], '01_入金ダッシュボード');
  assert.equal(calc.hidden, true);
  assert.equal(dash.charts.length, 1);

  const all = { ...dash.formulasA1, ...calc.formulasA1 };
  assert.ok(Object.keys(all).length > 40);
  Object.values(all).forEach(checkFormula);

  // 計算用：受領管理の列（開始年月=D、入金月数=H、最終入金月=I）と台帳の解約列（12列目）を参照する
  assert.match(calc.formulasA1['2,4'], /'20_受領管理'!D2:D/);
  assert.match(calc.formulasA1['2,5'], /'20_受領管理'!H2:H/);
  assert.match(calc.formulasA1['2,8'], /VLOOKUP\('20_受領管理'!A2:A,'10_タレント台帳'!A2:N,12,FALSE\)/);
  assert.match(calc.formulasA1['2,9'], /INDEX\('20_受領管理'!A2:J,0,MAX\(1,\$M\$5\)\)/);
  assert.match(calc.formulasA1['5,13'], /MATCH\(M1,ARRAYFORMULA\(.*'20_受領管理'!A1:J1/);
  assert.equal(calc.formulasA1['1,13'], "='01_入金ダッシュボード'!B4");
  // ダッシュボード：未入金者一覧と事務所別
  assert.match(dash.formulasA1['9,7'], /^=IFERROR\(SORT\(FILTER\('_入金集計'!A2:F,/);
  assert.match(dash.formulasA1['20,2'], /"東京"/);
  assert.match(dash.formulasA1['21,2'], /"大阪"/);

  // 2回目：対象月と月謝は残し、グラフは作り直す
  dash.cells[2][1] = '2026/09';
  dash.cells[4][1] = 25000;
  ctx.buildPaymentDashboard();
  assert.equal(dash.cells[2][1], '2026/09');
  assert.equal(dash.cells[4][1], 25000);
  assert.equal(dash.charts.length, 1);
});

test('列番号の文字変換', () => {
  const ctx = load(makeSpreadsheet());
  assert.equal(ctx.colLetter_(1), 'A');
  assert.equal(ctx.colLetter_(26), 'Z');
  assert.equal(ctx.colLetter_(39), 'AM');
});
