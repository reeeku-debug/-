// REALITY_日次取込.gs のテスト（Node 18+ の node:test で実行：`node --test reality-tier/tests`）
// Apps Script の SpreadsheetApp などは最小限のモックで置き換える。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'REALITY_日次取込.gs'), 'utf8');

// ---- 最小限のスプレッドシートのモック ----
class FakeRange {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = (this.sheet.cells[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() {
    return this.getValues()[0][0];
  }
  setValue(v) {
    return this.setValues([[v]]);
  }
  setValues(values) {
    if (values.length !== this.nr || values[0].length !== this.nc) throw new Error('size mismatch');
    if (this.row - 1 + this.nr > this.sheet.maxRows) throw new Error('out of rows');
    values.forEach((line, r) => {
      const target = this.sheet.cells[this.row - 1 + r] || (this.sheet.cells[this.row - 1 + r] = []);
      line.forEach((v, c) => (target[this.col - 1 + c] = v));
    });
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.nr; r++) {
      const line = this.sheet.cells[this.row - 1 + r];
      if (line) for (let c = 0; c < this.nc; c++) line[this.col - 1 + c] = '';
    }
    return this;
  }
  setNumberFormat() {
    return this;
  }
}
class FakeSheet {
  constructor(name, cells = []) {
    this.name = name;
    this.cells = cells.map((r) => r.slice());
    this.maxRows = Math.max(1000, cells.length);
  }
  getName() {
    return this.name;
  }
  getRange(row, col, nr = 1, nc = 1) {
    if (typeof row === 'string') {
      const m = row.match(/^([A-Z])(\d+)(?::([A-Z])(\d+))?$/);
      const c1 = m[1].charCodeAt(0) - 64;
      const r1 = Number(m[2]);
      const c2 = m[3] ? m[3].charCodeAt(0) - 64 : c1;
      const r2 = m[4] ? Number(m[4]) : r1;
      return new FakeRange(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new FakeRange(this, row, col, nr, nc);
  }
  getLastRow() {
    for (let r = this.cells.length - 1; r >= 0; r--) {
      if ((this.cells[r] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  }
  getMaxRows() {
    return this.maxRows;
  }
  insertRowsAfter(_, n) {
    this.maxRows += n;
  }
  getMaxColumns() {
    return 26;
  }
  insertColumnsAfter() {}
  appendRow(line) {
    this.cells[this.getLastRow()] = line.slice();
  }
}
function makeSpreadsheet() {
  const sheets = {
    設定: new FakeSheet('設定', [
      [], [], [], [],
      ['会社への還元率', 0.35], ['評価月（手動指定）', ''], ['最新データ月', 202608], ['評価月（使用中）', 202608],
      [], [], ['基本条件h', 60], ['基本条件イベント', 5], ['T1', 500000], ['T2', 300000], ['T3', 100000], ['救済', 'ON'],
    ]),
    ティア判定: new FakeSheet('ティア判定'),
    タレントマスタ: new FakeSheet('タレントマスタ', [[], [], [], ['ID', '配信者名（最新）', '担当者', 'メモ', '追加日']]),
    月次RAW: new FakeSheet('月次RAW', [['月キー', 'ID']]),
    日次RAW: new FakeSheet('日次RAW', [['対象日']]),
    取込ログ: new FakeSheet('取込ログ', [['取込日時']]),
  };
  return { sheets, getSheetByName: (n) => sheets[n] || null };
}

function load(source = SOURCE) {
  const ctx = {
    console,
    Utilities: { formatDate: () => '2026/10/15 10:00' },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return ctx;
}
const run = (ctx, expr, vars = {}) => {
  Object.assign(ctx, vars);
  return vm.runInContext(expr, ctx);
};

const HEADER = 'ID,配信者名,REALITYランク,配信回数,配信時間,視聴者数,合計ギフト金額,スコア,参加中のイベント,初配信日';

// ---- CSV の読み取り ----
test('CSVの列名ゆれ・引用符・時間表記・イベント一覧を読み取れる', () => {
  const ctx = load();
  const csv =
    '\uFEFF' + HEADER + '\n' +
    'a1,"みるね, 配信中",A,10,12:30:00,100,"1,234.5",999,"夏祭り\n秋イベ",2025/06/14\n' +
    'b2,たね,B,3,7.5,10,0,0,3,\n' +
    ',合計,,,,,,,,\n';
  const recs = run(ctx, 'parseRealityCsv_(csv)', { csv });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].name, 'みるね, 配信中');
  assert.equal(recs[0].hours, 12.5);
  assert.equal(recs[0].gift, 1234.5);
  assert.equal(recs[0].events, 2);
  assert.equal(recs[0].debut, '2025/06/14');
  assert.equal(recs[1].hours, 7.5);
  assert.equal(recs[1].events, 3);
});

test('必須の列がないと分かりやすいエラーになる', () => {
  const ctx = load();
  assert.throws(() => run(ctx, 'parseRealityCsv_("名前,売上\\nx,1")'), /列が見つかりません/);
});

test('ファイル名から期間を読み取る', () => {
  const ctx = load();
  const p = run(ctx, 'periodFromFileName_("streamer_20261001_20261005.csv")');
  assert.equal(run(ctx, 'ymd_(p.start)', { p }), 20261001);
  assert.equal(run(ctx, 'ymd_(p.end)', { p }), 20261005);
  assert.equal(run(ctx, 'periodFromFileName_("data.csv")'), null);
});

test('月の計算（年またぎ）', () => {
  const ctx = load();
  assert.equal(run(ctx, 'addMonths_(202511, 2)'), 202601);
  assert.equal(run(ctx, 'addMonths_(202601, -2)'), 202511);
  assert.equal(run(ctx, 'monthDiff_(202602, 202511)'), 3);
});

// ---- ティア判定 ----
const CFG = { rate: 0.35, evalMonth: 202608, hours: 60, events: 5, t1: 500000, t2: 300000, t3: 100000, rescue: true };
// [月キー, ID, 名前, ランク, 回数, 時間, 視聴者, ギフト, スコア, イベント, 初配信日]
const row = (m, id, hours, gift, events, debut) => [m, id, id, 'A', 1, hours, 0, gift, 0, events, debut];

test('T1〜T5・未評価の判定（ティア判定シートと同じ優先順位）', () => {
  const ctx = load();
  const rows = [
    // T1：基本条件◯＋3ヶ月平均50万
    row(202606, 't1', 80, 500000, 5, '2025/01/01'), row(202607, 't1', 80, 500000, 5, ''), row(202608, 't1', 80, 500000, 5, ''),
    // T2：3ヶ月平均30万
    row(202608, 't2', 60, 900000, 5, '2025/01/01'),
    // T3（救済）：デビュー4ヶ月目以降、直近3ヶ月に10万
    row(202608, 't3r', 10, 100000, 0, '2025/01/01'),
    // T4：初月60h・5回、10万未達、デビュー2ヶ月以内
    row(202607, 't4', 60, 1000, 5, '2026/07/10'), row(202608, 't4', 10, 1000, 0, ''),
    // T5
    row(202608, 't5', 10, 1000, 0, '2025/01/01'),
    // 未評価：評価月より後にデビュー
    row(202608, 'u', 1, 0, 0, '2026/09/20'),
  ];
  const res = run(ctx, 'judgeMonth_(buildMonthlyIndex_(rows), 202608, cfg)', { rows, cfg: CFG });
  const tiers = Object.fromEntries(res.map((x) => [x.id, x.tier]));
  assert.deepEqual(tiers, { t1: 'T1', t2: 'T2', t3r: 'T3', t4: 'T4', t5: 'T5', u: '未評価' });
  const t4 = res.find((x) => x.id === 't4');
  assert.match(t4.next, /期限：202609/);

  const off = run(ctx, 'judgeMonth_(buildMonthlyIndex_(rows), 202608, cfg)', { rows, cfg: { ...CFG, rescue: false } });
  assert.equal(off.find((x) => x.id === 't3r').tier, 'T5');
});

test('11月デビューは翌年1月までを「デビュー3ヶ月以内」として数える', () => {
  const ctx = load();
  const rows = [
    row(202511, 'n', 70, 1000, 5, '2025/11/06'),
    row(202512, 'n', 70, 1000, 5, ''),
    row(202601, 'n', 70, 150000, 5, ''),
  ];
  const res = run(ctx, 'judgeMonth_(buildMonthlyIndex_(rows), 202601, cfg)', { rows, cfg: { ...CFG, rescue: false } });
  assert.equal(res[0].tier, 'T3');
  assert.equal(res[0].reason, 'デビュー3ヶ月以内に月10万達成');
});

// ---- 取込（テスト運用シートのテストケース1〜4・7・10相当） ----
function csvOf(lines) {
  return HEADER + '\n' + lines.map((l) => l.join(',')).join('\n') + '\n';
}

test('日次取込：増分の計算・重複防止・古い期間のスキップ・月次RAWの上書き', () => {
  const ctx = load();
  const ss = makeSpreadsheet();
  const imp = (name, lines) => run(ctx, 'importCsv_(ss, text, name, "fid-" + name, null)', { ss, text: csvOf(lines), name });

  // 1. 初回：増分＝累計
  let r = imp('streamer_20260801_20260803.csv', [['m', 'みるね', 'A', 3, 13.1, 0, 100000, 10, 1, '2025/06/14'], ['t', 'たね', 'B', 1, 2, 0, 500, 1, 0, '']]);
  assert.equal(r.ok, true);
  const daily = ss.sheets['日次RAW'];
  assert.equal(daily.getLastRow(), 3);
  assert.equal(daily.cells[1][11], 13.1);

  // 2. 差分：30.5 − 13.1 = 17.4
  r = imp('streamer_20260801_20260807.csv', [['m', 'みるね', 'A', 6, 30.5, 0, 266595.89, 20, 2, '2025/06/14'], ['t', 'たね', 'B', 1, 2, 0, 500, 1, 0, '']]);
  assert.equal(r.ok, true);
  const mRow = daily.cells.filter((l) => l && l[3] === 'm').pop();
  assert.equal(mRow[11], 17.4);
  assert.equal(Math.round(mRow[12] * 100) / 100, 166595.89);

  // 3. 同じ期間をもう一度 → 日次RAWは増えない（月次RAWだけ入れ直す）
  r = imp('streamer_20260801_20260807 (1).csv', [['m', 'みるね', 'A', 6, 30.5, 0, 266595.89, 20, 2, ''], ['t', 'たね', 'B', 1, 2, 0, 500, 1, 0, '']]);
  assert.equal(r.ok, true);
  assert.match(r.message, /月次RAWだけ更新/);
  assert.equal(daily.getLastRow(), 5);

  // 古い期間 → スキップ（増分がマイナスにならない）
  r = imp('streamer_20260801_20260805.csv', [['m', 'みるね', 'A', 5, 20, 0, 1, 1, 1, '']]);
  assert.equal(r.ok, false);
  assert.match(r.message, /古い期間/);

  // 4. 間が抜けても次のCSVとの差分にまとめて入る：61.1 − 30.5 = 30.6
  imp('streamer_20260801_20260814.csv', [['m', 'みるね', 'A', 9, 61.1, 0, 300000, 30, 3, '2025/06/14'], ['t', 'たね', 'B', 2, 3, 0, 800, 1, 0, '']]);
  assert.equal(daily.cells.filter((l) => l && l[3] === 'm').pop()[11], 30.6);

  // 7. 月次RAWの202608は最新の累計だけ（重複しない）
  const monthly = ss.sheets['月次RAW'].cells.slice(1).filter((l) => l && l[0] === 202608);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0][5], 61.1);
  assert.equal(monthly[0][11], '202608|m');

  // 10. 月またぎ＋新人：9/1分は当日値で入り、タレントマスタに追加、ティア判定のIDが9月在籍者に
  imp('streamer_20260901_20260901.csv', [['m', 'みるね', 'A', 1, 4, 0, 10000, 1, 1, ''], ['new', 'テスト新人', 'E', 1, 1, 0, 0, 0, 0, '2026/09/01']]);
  assert.equal(daily.cells.filter((l) => l && l[3] === 'm').pop()[11], 4);
  const master = ss.sheets['タレントマスタ'].cells.slice(4).map((l) => l[0]);
  assert.deepEqual(master, ['m', 't', 'new']);
  const roster = ss.sheets['ティア判定'].cells.slice(4).map((l) => l[0]).filter(Boolean);
  assert.deepEqual(roster, ['m', 'new']);
  // 月次RAWは月キー順を保つ
  const keys = ss.sheets['月次RAW'].cells.slice(1).map((l) => l[0]);
  assert.deepEqual(keys, [202608, 202608, 202609, 202609]);

  const log = ss.sheets['取込ログ'].cells.slice(1).map((l) => l[5]);
  assert.equal(log.filter((x) => String(x).startsWith('OK')).length, 5);
});

test('期間が月をまたぐCSVはエラーとして記録される', () => {
  const ctx = load();
  const ss = makeSpreadsheet();
  const r = run(ctx, 'importCsv_(ss, text, "streamer_20260825_20260905.csv", "x", null)', {
    ss,
    text: csvOf([['m', 'みるね', 'A', 1, 1, 0, 1, 1, 1, '']]),
  });
  assert.equal(r.ok, false);
  assert.match(ss.sheets['取込ログ'].cells[1][5], /^エラー：期間が月をまたいでいます/);
});

// ---- アプリの書き出しCSV → スプレッドシート ----
test('アプリの書き出しCSVで月次RAWの各月を置き換え、担当者は空欄だけ埋める', () => {
  const ctx = load();
  const ss = makeSpreadsheet();
  ss.sheets['月次RAW'].cells.push([202607, 'old', '旧', 'A', 1, 1, 0, 1, 0, 0, '', '202607|old', 'x']);
  ss.sheets['月次RAW'].cells.push([202605, 'keep', '残る', 'A', 1, 1, 0, 1, 0, 0, '', '202605|keep', 'x']);
  ss.sheets['タレントマスタ'].cells.push(['m', 'みるね旧名', '井上', 'メモ', '初期登録']);
  ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  vm.runInContext('refreshAll_ = function () {};', ctx);

  const text = '\uFEFF月キー,ID,配信者名,REALITYランク,配信回数,配信時間（h）,視聴者数,ギフト金額（円）,スコア,イベント参加数,初配信日,担当者\r\n' +
    '202607,m,みるね,A,10,70.5,0,120000,1,5,2025/06/14,新田\r\n' +
    '202607,t,たね,B,1,2,0,500,0,0,,渡邊\r\n' +
    '202608,m,みるね新名,A,9,61.1,0,300000,1,5,2025/06/14,新田\r\n';
  const msg = run(ctx, 'importAppExport("REALITY_アプリ書き出し.csv", text)', { text });
  assert.match(msg, /^OK・2ヶ月/);

  const monthly = ss.sheets['月次RAW'].cells.slice(1).filter((l) => l && l[0] !== '' && l[0] !== undefined);
  assert.deepEqual(monthly.map((l) => [l[0], l[1]]), [[202605, 'keep'], [202607, 'm'], [202607, 't'], [202608, 'm']]);
  const master = ss.sheets['タレントマスタ'].cells.slice(4);
  assert.deepEqual(master.map((l) => [l[0], l[1], l[2]]), [['m', 'みるね新名', '井上'], ['t', 'たね', '渡邊']]);
  assert.deepEqual(ss.sheets['ティア判定'].cells.slice(4).map((l) => l[0]).filter(Boolean), ['m']);
});

test('実際のREALITY配信レポートCSVの列名を読み取れる', () => {
  const ctx = load();
  const csv = '配信者名,ID,ランク,合計配信回数,合計配信時間（時）,合計視聴者数,合計被視聴時間（時）,合計ギフト金額,合計獲得スコア,参加中のイベント,初配信日,デビュー条件,トップ到達,今月のスコアボーナス金額\n' +
    'みるね,a1,A,12,30.5,100,200.5,"166,595.89",9999,"夏祭り\n秋イベ",2025/06/14,済,,0\n';
  const recs = run(ctx, 'parseRealityCsv_(csv)', { csv });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].id, 'a1');
  assert.equal(recs[0].name, 'みるね');
  assert.equal(recs[0].rank, 'A');
  assert.equal(recs[0].count, 12);
  assert.equal(recs[0].hours, 30.5);
  assert.equal(recs[0].viewers, 100);
  assert.equal(recs[0].gift, 166595.89);
  assert.equal(recs[0].score, 9999);
  assert.equal(recs[0].events, 2);
  assert.equal(recs[0].debut, '2025/06/14');
});

// ---- ダッシュボード用の窓口（doPost） ----
test('doPost：合言葉の確認・データ読み込み・担当者の保存・CSV取込', () => {
  const ctx = load(SOURCE.replace("const TOKEN = 'ここを長い合言葉に書き換える';", "const TOKEN = 'secret-token';"));
  const ss = makeSpreadsheet();
  ss.getUrl = () => 'https://docs.google.com/spreadsheets/d/x/edit';
  ss.sheets['月次RAW'].cells.push([202608, 'm', 'みるね', 'A', 9, 61.1, 0, 300000, 1, 5, new Date(2025, 5, 14), '202608|m', 'x']);
  ss.sheets['タレントマスタ'].cells.push(['m', 'みるね', '', '', '初期登録']);
  ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ss, flush: () => {} };
  ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) };
  vm.runInContext('refreshAll_ = function () {};', ctx);
  const post = (body) => JSON.parse(run(ctx, 'doPost({ postData: { contents: body } }).text', { body: JSON.stringify(body) }));

  assert.equal(post({ token: 'wrong', action: 'load' }).error, 'unauthorized');

  const loaded = post({ token: 'secret-token', action: 'load' });
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.months, [[202608, 'm', 'みるね', 'A', 9, 61.1, 0, 300000, 1, 5, '2025/06/14']]);
  assert.equal(loaded.criteria.hours, 60);
  assert.equal(loaded.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/x/edit');

  assert.equal(post({ token: 'secret-token', action: 'saveTalent', id: 'm', owner: '井上', memo: '連絡済み' }).ok, true);
  assert.equal(post({ token: 'secret-token', action: 'saveTalent', id: 'new', owner: '新田', memo: '' }).ok, true);
  assert.deepEqual(post({ token: 'secret-token', action: 'load' }).talents, [['m', 'みるね', '井上', '連絡済み'], ['new', '', '新田', '']]);

  const csv = '配信者名,ID,ランク,合計配信回数,合計配信時間（時）,合計視聴者数,合計ギフト金額,合計獲得スコア,参加中のイベント,初配信日\nみるね,m,A,3,10.5,0,50000,1,1,2025/06/14\n';
  const imp = post({ token: 'secret-token', action: 'import', files: [{ name: 'streamer_20261001_20261015.csv', text: csv, start: '2026-10-01', end: '2026-10-15' }] });
  assert.equal(imp.ok, true);
  assert.match(imp.messages[0], /^streamer_20261001_20261015\.csv：OK・1行/);
  const after = post({ token: 'secret-token', action: 'load' });
  assert.deepEqual(after.periods, { 202610: '2026/10/15' });
  assert.equal(after.log[0][4].startsWith('OK'), true);
});

test('doGet：アプリの画面を返す（?ping=1 なら動作確認のJSON）', () => {
  const ctx = load();
  let shown = null;
  const out = { setTitle() { return out; }, addMetaTag() { return out; } };
  ctx.HtmlService = { createHtmlOutput: (html) => ((shown = html), out) };
  ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) };
  run(ctx, 'doGet({ parameter: {} })');
  assert.match(shown, /ライバーTier判定/);
  assert.match(shown, /google\.script\.run/);
  assert.equal(JSON.parse(run(ctx, 'doGet({ parameter: { ping: "1" } }).text')).ok, true);
});

test('売上ダッシュボード：所属IDで東京／大阪／MUSICに分け、TOTAL売上＝ギフト×還元率＋ボーナス', () => {
  const ctx = load();
  const ss = makeSpreadsheet();
  ss.sheets['月次RAW'].cells.push(
    [202609, 'o1', '大阪の人', 'A', 1, 10, 0, 100000, 0, 0, '', '202609|o1', 'x', 5000],
    [202609, 'm1', 'MUSICの人', 'A', 1, 5, 0, 20000, 0, 0, '', '202609|m1', 'x', 0],
    [202609, 't1', '東京の人', 'A', 1, 8, 0, 50000, 0, 0, '', '202609|t1', 'x', 10000],
    [202609, 'both', '両方にいる人', 'A', 1, 1, 0, 1000, 0, 0, '', '202609|both', 'x', 0]
  );
  ss.sheets['所属ID'] = new FakeSheet('所属ID', [['大阪の所属者ID', 'MUSICの所属者ID'], ['o1', 'm1'], ['both', 'both']]);
  const d = run(ctx, 'salesData_(ss)', { ss });
  const g = d.months[202609].groups;
  assert.equal(g['大阪'].n, 2); // 両方にいる人は大阪（管理シートと同じ優先順位）
  assert.equal(g['MUSIC'].n, 1);
  assert.equal(g['東京'].n, 1);
  assert.equal(Math.round(g['大阪'].total), Math.round(100000 * 0.35 + 5000 + 1000 * 0.35));
  assert.equal(Math.round(g['合計'].total), Math.round((100000 + 20000 + 50000 + 1000) * 0.35 + 15000));
});

test('CSVの「今月のスコアボーナス金額」を読み取る', () => {
  const ctx = load();
  const csv = '配信者名,ID,合計配信時間（時）,合計ギフト金額,今月のスコアボーナス金額\nみるね,a1,10,1000,20000\n';
  assert.equal(run(ctx, 'parseRealityCsv_(csv)', { csv })[0].bonus, 20000);
});

test('同じ期間のCSVを入れ直すと、月次RAWのボーナスが更新される', () => {
  const ctx = load();
  const ss = makeSpreadsheet();
  const head = '配信者名,ID,合計配信時間（時）,合計ギフト金額,今月のスコアボーナス金額\n';
  const imp = (text) => run(ctx, 'importCsv_(ss, text, "streamer_20261001_20261015.csv", "f", null)', { ss, text });
  imp(head + 'みるね,m,10,1000,\n');
  assert.equal(imp(head + 'みるね,m,10,1000,20000\n').ok, true);
  const row = ss.sheets['月次RAW'].cells.find((l) => l && l[1] === 'm');
  assert.equal(row[13], 20000);
  assert.equal(ss.sheets['日次RAW'].getLastRow(), 2); // 日次RAWは1回分だけ
});

test('管理シートから取込：シート名に / が入っていても、所属IDと今月・過去月のボーナスを拾う', () => {
  const ctx = load();
  const ss = makeSpreadsheet();
  ss.sheets['月次RAW'].cells.push(
    [202608, 'aaaaaaaaaaaaaaaaaaaaaaaaaa', 'a', 'A', 1, 1, 0, 1000, 0, 0, '', '', 'x'],
    [202610, 'aaaaaaaaaaaaaaaaaaaaaaaaaa', 'a', 'A', 1, 1, 0, 1000, 0, 0, '', '', 'x']
  );
  const list = (rows) => [[], [], [], [], [], [], [], [], [], [], [], [], [], ['', '', 'ID']].concat(rows);
  const src = {
    'REALITY大阪紐付け済': new FakeSheet('REALITY大阪紐付け済', [['', 'ID'], ['大阪', 'aaaaaaaaaaaaaaaaaaaaaaaaaa']]),
    'REALITY MUSIC紐付け済': new FakeSheet('REALITY MUSIC紐付け済', [['', 'ID']]),
    'REALITY売上計算（東京/大阪/MUSIC）': new FakeSheet('x', list([['大阪', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaaa', 0, 0, 0, 0, 1000, 0, 30000]])),
    'REALITY売上計算（東京/大阪/MUSIC）8月実績': new FakeSheet('x', list([['大阪', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaaa', 0, 0, 0, 0, 1000, 0, 10000]])),
  };
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    openById: () => ({ getSheets: () => Object.keys(src).map((n) => Object.assign(src[n], { getName: () => n })) }),
    flush: () => {},
  };
  ss.toast = () => {};
  ss.sheets['所属ID'] = new FakeSheet('所属ID', [['大阪の所属者ID', 'MUSICの所属者ID']]);
  vm.runInContext('renderSalesDashboard_ = function () {}; ym_ = function () { return 202610; };', ctx);
  run(ctx, 'importFromManagementSheet()');
  const rows = ss.sheets['月次RAW'].cells.filter((l) => l && l[1] === 'aaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(rows.map((l) => [l[0], l[13]]), [[202608, 10000], [202610, 30000]]);
  assert.equal(ss.sheets['所属ID'].cells[1][0], 'aaaaaaaaaaaaaaaaaaaaaaaaaa');
});
