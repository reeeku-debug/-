// webapp/App.html を MIXCH_ティア.gs の MX_APP_HTML_ に埋め込む（Apps Script は1ファイル貼るだけで済むように）
// 使い方：node mixch-tier/build.js
const fs = require('fs');
const path = require('path');

const gsPath = path.join(__dirname, 'MIXCH_ティア.gs');
const html = fs.readFileSync(path.join(__dirname, 'webapp', 'App.html'), 'utf8');
const gs = fs.readFileSync(gsPath, 'utf8');
const lines = html.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const body = 'const MX_APP_HTML_ = [\n' + lines.map((l) => '  ' + JSON.stringify(l) + ',').join('\n') + "\n].join('\\n');";
const next = gs.replace(/(\/\/ <APP_HTML>\n)[\s\S]*?(\n\/\/ <\/APP_HTML>)/, (_, a, b) => a + body + b);
if (next === gs && !gs.includes(body)) throw new Error('APP_HTML の目印が見つかりません');
fs.writeFileSync(gsPath, next);
console.log('MX_APP_HTML_ を更新しました（' + lines.length + '行）');
