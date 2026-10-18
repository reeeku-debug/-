// node --test mixch-tier/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'MIXCH_ティア.gs'), 'utf8');
function load(extra) {
  const ctx = Object.assign({ console }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
const CFG = { hours: 60, events: 3, t2: 250000, t1: 500000, start: 202610 };
const HEAD = 'ユーザーID,ユーザー名,所属プロモーター名,契約形態,ライバー獲得分+プロモーター獲得分の振込金額（税調整後）,プロモーター獲得分（税抜）,ライバー獲得分（税抜）,ライブ配信回数,ライブ配信時間,動画投稿回数';
// [月, ID, 名前, 区分, プロモーター, 契約, プロ, ライバー, 売上, 回数, 時間, 動画]
const row = (m, id, hours, sales, group) => [m, id, '名' + id, group || '大元', '', '', sales * 0.3, sales * 0.7, sales, 1, hours, 0];

test('CSVを読む：日数つきの配信時間・2回目の見出し・数値のID', () => {
  const ctx = load();
  const text = '﻿' + HEAD + '\n' +
    '18978343,いぬ,アソビシステム株式会社(ASOBINEXT),成果型・独占契約,104558,"29,724",74834,12,"1 day, 17:56:24",3\n' +
    HEAD + '\n' +
    '18978344.0,ねこ,アソビシステム株式会社-ASOBINEXT-,成果型,0,0,0,0,7:30:00,0\n';
  const recs = ctx.mxParseCsv_(text);
  assert.strictEqual(recs.length, 2);
  assert.strictEqual(recs[0].id, '18978343');
  assert.strictEqual(recs[0].pro, 29724);
  assert.strictEqual(recs[0].sales, 29724 + 74834);
  assert.strictEqual(Math.round(recs[0].hours * 100) / 100, 41.94);
  assert.strictEqual(recs[1].id, '18978344');
  assert.strictEqual(recs[1].hours, 7.5);
  assert.throws(() => ctx.mxParseCsv_('a,b\n1,2'), /列が見つかりません/);
});

test('配信時間の書き方', () => {
  const ctx = load();
  assert.strictEqual(ctx.mxHours_('2 days, 3:00:00'), 51);
  assert.strictEqual(ctx.mxHours_('41:30:00'), 41.5);
  assert.strictEqual(ctx.mxHours_(''), 0);
});

test('月の読み取り', () => {
  const ctx = load();
  assert.strictEqual(ctx.mxParseYm('2026/08', null), 202608);
  assert.strictEqual(ctx.mxParseYm('202610', null), 202610);
  assert.strictEqual(ctx.mxParseYm('11', 202610), 202511);
  assert.strictEqual(ctx.mxParseYm('10月', 202610), 202610);
  assert.strictEqual(ctx.mxAddMonths(202601, -2), 202511);
});

test('ティア判定：既存（従来ルール）は60hを超えた月からティア入り、売上でティア1〜3', () => {
  const ctx = load();
  const idx = ctx.mxBuildIndex([
    row(202608, 'a', 70, 100000), row(202609, 'a', 10, 300000), row(202610, 'a', 5, 600000),
    row(202608, 'b', 30, 900000), row(202609, 'b', 0, 0), row(202611, 'b', 0, 0),
  ]);
  assert.strictEqual(ctx.mxJudge(idx, 'a', 202608, CFG, {}).tier, 'ティア3');
  assert.strictEqual(ctx.mxJudge(idx, 'a', 202609, CFG, {}).tier, 'ティア2');
  assert.strictEqual(ctx.mxJudge(idx, 'a', 202610, CFG, {}).tier, 'ティア1候補');
  assert.strictEqual(ctx.mxJudge(idx, 'a', 202610, CFG, { approve: '○' }).tier, 'ティア1');
  assert.strictEqual(ctx.mxJudge(idx, 'a', 202610, CFG, { event: '×' }).tier, 'ティア外');
  const b = ctx.mxJudge(idx, 'b', 202608, CFG, {});
  assert.strictEqual(b.tier, 'ティア外');
  assert.match(b.reason, /ティア1水準/);
  assert.strictEqual(ctx.mxJudge(idx, 'b', 202608, CFG, { personal: '○' }).tier, 'パーソナル枠');
  assert.strictEqual(ctx.mxJudge(idx, 'b', 202608, CFG, { special: '2026/08' }).tier, 'ティア1候補');
  assert.strictEqual(ctx.mxJudge(idx, 'b', 202611, CFG, { special: '2026/08' }).tier, 'ティア外', '直近3ヶ月の配信が0ならティア外');
});

test('ティア判定：開始月以降のデビューは初月に60hが必要', () => {
  const ctx = load();
  const idx = ctx.mxBuildIndex([
    row(202610, 'n', 65, 0), row(202611, 'n', 10, 0),
    row(202610, 'm', 20, 0), row(202611, 'm', 80, 0),
  ]);
  const n = ctx.mxJudge(idx, 'n', 202611, CFG, {});
  assert.strictEqual(n.tier, 'ティア3');
  assert.strictEqual(n.shoki, '達成');
  const m10 = ctx.mxJudge(idx, 'm', 202610, CFG, {});
  assert.strictEqual(m10.tier, 'ティア外');
  assert.match(m10.shoki, /^初月中（あと40\.0h）/);
  const m11 = ctx.mxJudge(idx, 'm', 202611, CFG, {});
  assert.strictEqual(m11.tier, 'ティア外');
  assert.strictEqual(m11.shoki, '未達→ティア外');
  assert.strictEqual(ctx.mxJudge(idx, 'm', 202611, CFG, { debut: '2026/11' }).tier, 'ティア3', 'デビュー月を直せば判定も変わる');
});

test('月ごとの一覧はティア順・売上順、既定の月は今月より前の最新月', () => {
  const ctx = load();
  const idx = ctx.mxBuildIndex([row(202609, 'x', 0, 10), row(202609, 'y', 70, 5), row(202609, 'z', 0, 99), row(202610, 'x', 1, 0)]);
  const list = ctx.mxJudgeMonth(idx, 202609, CFG, {});
  assert.strictEqual(list.map((x) => x.id).join(), 'y,z,x');
  assert.strictEqual(ctx.mxDefaultMonth(idx, CFG, 202610), 202609);
  assert.strictEqual(ctx.mxDefaultMonth(idx, Object.assign({}, CFG, { evalMonth: 202610 }), 202610), 202610);
});

test('アプリの画面：判定の関数が埋め込まれ、スクリプトとして読める', () => {
  let html = '';
  const out = { setTitle() { return out; }, addMetaTag() { return out; } };
  const ctx = load({ HtmlService: { createHtmlOutput(h) { html = h; return out; } } });
  ctx.doGet();
  assert.ok(!html.includes('/*__MX_SHARED__*/'));
  assert.ok(html.includes('function mxJudge('));
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('取込から全シートの更新まで（スプレッドシートのモック）', () => {
  const { makeContext } = require('./fake-sheets');
  const { ctx, ss } = makeContext(fs, vm, path.join(__dirname, '..', 'MIXCH_ティア.gs'));
  ctx.setupMixch();
  const csv = (rows) => HEAD + '\n' + rows.map((r) => r.join(',')).join('\n');
  const big = ['1', 'あ', 'アソビシステム株式会社(ASOBINEXT)', '成果型', '0', '30000', '70000', '20', '"2 days, 22:00:00"', '1'];
  const small = ['2', 'い', 'アソビシステム株式会社-ASOBINEXT-', '成果型', '0', '1000', '2000', '3', '5:00:00', '0'];
  const res = ctx.mxImportFiles([
    { name: '8月.csv', text: csv([big, small]), month: 202608 },
    { name: '9月.csv', text: csv([big.slice(0, 8).concat(['10:00:00', '0']), small]), month: 202609 },
  ]);
  assert.ok(res.every((m) => /：OK/.test(m)), res.join('\n'));
  const names = ss.getSheets().map((s) => s.getName());
  ['マニュアル', '売上ダッシュボード', '月別ティア', 'ティア判定', 'サマリー', 'タレント分け', 'ティア推移'].forEach((n) => assert.ok(names.includes(n), n));
  const sum = ss.getSheetByName('サマリー');
  assert.strictEqual(sum.getRange(4, 2, 1, 2).getValues()[0].join(), '大元,ぷち');
  sum.getRange(8, 12).setValue(4); // ティア3 の新規目標
  sum.getRange(8, 17).setValue('井上');
  ctx.mxRefreshAll();
  assert.strictEqual(sum.getRange(8, 8).getValue(), 'ティア3');
  assert.strictEqual(sum.getRange(8, 9).getValue(), 1);
  assert.strictEqual(sum.getRange(8, 12).getValue(), 4, '手入力の列は更新しても残る');
  assert.strictEqual(sum.getRange(8, 17).getValue(), '井上');
  const view = ss.getSheetByName('月別ティア');
  assert.strictEqual(view.getRange(5, 6).getValue(), 1); // ティア3 の人数（9月）
  const hist = ss.getSheetByName('ティア推移');
  assert.strictEqual(hist.getRange(4, 2, 1, 2).getValues()[0].join(), '2026年8月,2026年9月');
});
