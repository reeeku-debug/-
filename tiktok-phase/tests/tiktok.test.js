// node --test tiktok-phase/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext } = require('./fake-sheets');

const FILE = path.join(__dirname, '..', 'TIKTOK_フェーズ.gs');
const CFG = { p4: 200000, p3: 100000, weekly: 3 };

function setup(extra) {
  const { ctx, ss } = makeContext(fs, vm, FILE);
  const props = { GEMINI_API_KEY: 'k' };
  const triggers = [];
  const chain = new Proxy({}, { get: () => () => chain });
  Object.assign(ctx, {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => (props[k] = v) }) },
    ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger() {}, newTrigger: (fn) => { triggers.push(fn); return chain; }, EventType: { CLOCK: 'CLOCK' } },
    Utilities: { formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? '2026-10-19' : f === 'yyyy/MM/dd' ? '2026/10/19' : '2026/10/19 10:00') },
  }, extra || {});
  return { ctx, ss, props, triggers };
}

test('フェーズの判定（SNS_フェーズ表の基準）', () => {
  const { ctx } = setup();
  const j = (r) => ctx.tkJudge(Object.assign({ avgManual: '', postsManual: '', avgAi: '', postsAi: '' }, r), CFG).phase;
  assert.strictEqual(j({}), '未判定');
  assert.strictEqual(j({ avgAi: 250000, postsAi: 4 }), 'フェーズ4');
  assert.strictEqual(j({ avgAi: 120000, postsAi: 4 }), 'フェーズ3候補');
  assert.strictEqual(j({ avgAi: 120000, postsAi: 4, approve: '○' }), 'フェーズ3');
  assert.strictEqual(j({ avgAi: 5000, postsAi: 2, paid: '○' }), 'フェーズ3候補', '有償案件でもフェーズ3の条件');
  assert.strictEqual(j({ avgAi: 5000, postsAi: 13 }), 'フェーズ2', '30日で13本＝週3.0本');
  assert.strictEqual(j({ avgAi: 5000, postsAi: 12 }), 'フェーズ1', '週2.8本');
  assert.strictEqual(j({ avgAi: 300000, excluded: '○' }), 'フェーズ外');
  assert.strictEqual(j({ avgAi: 5000, postsAi: 2, avgManual: 210000 }), 'フェーズ4', '手入力が優先');
  const r = ctx.tkJudge({ avgAi: 5000, postsAi: 6, avgManual: '', postsManual: '' }, CFG);
  assert.strictEqual(r.weekly, 1.4);
  assert.match(r.next, /週3本投稿（あと週1.6本）/);
  assert.strictEqual(ctx.tkChange('フェーズ3', 'フェーズ2'), '昇格');
  assert.strictEqual(ctx.tkChange('フェーズ1', 'フェーズ2'), '降格');
  assert.strictEqual(ctx.tkChange('フェーズ2', ''), '新規');
});

test('URLの正規化', () => {
  const { ctx } = setup();
  assert.strictEqual(ctx.tkNormalizeUrl('https://www.tiktok.com/@Abc.def_1?lang=ja'), 'https://www.tiktok.com/@abc.def_1');
  assert.strictEqual(ctx.tkNormalizeUrl('@abc'), 'https://www.tiktok.com/@abc');
  assert.strictEqual(ctx.tkNormalizeUrl('https://vt.tiktok.com/xyz/'), 'https://vt.tiktok.com/xyz/');
});

test('TikTokのページとGeminiの答えを読む', () => {
  const { ctx } = setup();
  const json = { __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: { uniqueId: 'abc', nickname: 'あ' }, stats: { followerCount: 1200, heartCount: 34000, videoCount: 56 } } } } };
  const html = '<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' + JSON.stringify(json) + '</script></html>';
  const p = ctx.tkParseProfileHtml_(html);
  assert.strictEqual(p.followers, 1200);
  assert.strictEqual(p.likes, 34000);
  assert.strictEqual(p.videos, 56);
  assert.strictEqual(ctx.tkParseProfileHtml_('<html>ログインしてください</html>'), null);
  const g = ctx.tkParseGemini_({ candidates: [{ content: { parts: [{ text: '```json\n{"followers": 1200, "posts_30d": 14, "avg_views_30d": "8,500", "last_post_date": "2026-10-17", "confidence": "中", "note": "ダンス動画が伸びている"}\n```' }] } }] });
  assert.strictEqual(g.posts30, 14);
  assert.strictEqual(g.avgViews, 8500);
  assert.strictEqual(g.confidence, '中');
  assert.throws(() => ctx.tkParseGemini_({ candidates: [{ content: { parts: [{ text: '調べられませんでした' }] } }] }), /読み取れません/);
});

test('URLを入れてAIで判定：数字を書き込み、フェーズ・履歴・サマリーを作る', () => {
  const calls = [];
  const page = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' + JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: {}, stats: { followerCount: 50000, heartCount: 900000, videoCount: 80 } } } } }) + '</script>';
  const UrlFetchApp = {
    fetch(url, opt) {
      calls.push(url);
      if (/tiktok\.com/.test(url)) return { getResponseCode: () => 200, getContentText: () => page };
      const body = JSON.parse(opt.payload);
      assert.ok(body.tools.some((t) => t.url_context), 'URLを開く機能を使う');
      assert.strictEqual(opt.headers['x-goog-api-key'], 'k');
      const text = /@aaa/.test(body.contents[0].parts[0].text)
        ? '{"followers": null, "posts_30d": 15, "avg_views_30d": 120000, "last_post_date": "2026-10-18", "confidence": "高", "note": "伸びている"}'
        : '{"followers": null, "posts_30d": 4, "avg_views_30d": 3000, "last_post_date": "2026-10-01", "confidence": "低", "note": "投稿が少ない"}';
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) };
    },
  };
  const { ctx, ss } = setup({ UrlFetchApp });
  ctx.setupTikTok();
  const sheet = ss.getSheetByName('フェーズ判定');
  sheet.getRange(5, 1, 2, 4).setValues([['あ', '井上', 'https://www.tiktok.com/@AAA', ''], ['い', '', '@bbb', '']]);
  ctx.tkUpdateAll();
  assert.strictEqual(calls.filter((u) => /generativelanguage/.test(u)).length, 2);
  const row = (r) => sheet.getRange(r, 1, 1, 26).getValues()[0];
  assert.strictEqual(row(5)[10], 'フェーズ3候補');
  assert.strictEqual(row(5)[17], 50000, 'フォロワーはページの数字');
  assert.strictEqual(row(6)[10], 'フェーズ1');
  sheet.getRange(5, 6).setValue('○');
  ctx.tkRefreshAll();
  assert.strictEqual(row(5)[10], 'フェーズ3');
  const hist = ss.getSheetByName('判定履歴');
  assert.strictEqual(hist.getLastRow(), 3);
  assert.strictEqual(hist.getRange(2, 1).getValue(), 202610);
  // 今日もう調べた人は飛ばす
  ctx.tkUpdateAll();
  assert.strictEqual(calls.filter((u) => /generativelanguage/.test(u)).length, 2);
  const sum = ss.getSheetByName('サマリー');
  assert.strictEqual(sum.getRange(6, 1).getValue(), 'フェーズ3');
  assert.strictEqual(sum.getRange(6, 3).getValue(), 1);
  const names = ss.getSheets().map((s) => s.getName());
  assert.strictEqual(names.slice(0, 4).join(), 'マニュアル,サマリー,タレント分け,フェーズ判定');
});

test('APIキーがないときは取得状況にエラーを書く', () => {
  const UrlFetchApp = { fetch: () => ({ getResponseCode: () => 403, getContentText: () => '' }) };
  const { ctx, ss, props } = setup({ UrlFetchApp });
  delete props.GEMINI_API_KEY;
  ctx.setupTikTok();
  const sheet = ss.getSheetByName('フェーズ判定');
  sheet.getRange(5, 1, 1, 3).setValues([['う', '', '@ccc']]);
  ctx.tkUpdateAll();
  assert.match(String(sheet.getRange(5, 26).getValue()), /APIキーが未設定/);
  assert.strictEqual(sheet.getRange(5, 11).getValue(), '未判定');
});

test('アプリの画面：判定の関数が埋め込まれ、スクリプトとして読める', () => {
  let html = '';
  const out = { setTitle() { return out; }, addMetaTag() { return out; } };
  const { ctx } = setup({ HtmlService: { createHtmlOutput(h) { html = h; return out; } } });
  ctx.doGet();
  assert.ok(html.includes('function tkJudge('));
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
});
