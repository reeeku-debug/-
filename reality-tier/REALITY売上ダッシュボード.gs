// REALITY 売上ダッシュボード
//
// 「アソビアライアンス マネジメント事業部 管理シート」に「REALITYダッシュボード」シートを作り、
// 今月と過去の月の売上を、数字のパネル・表・グラフで一目で確認できるようにする Apps Script です。
//
// 使い方
//   1. 管理シートで「拡張機能 → Apps Script」を開く
//   2. 左の「ファイル」の＋ →「スクリプト」で新しいファイルを作り、名前を「REALITY売上ダッシュボード」にする
//      （すでにあるコードは消さないでください）
//   3. このファイルの中身を全部貼り付けて保存する
//   4. 上の関数の選択欄で「buildRealityDashboard」を選んで「実行」し、権限を許可する
//
// 数字はすべて元のシートを参照する数式なので、元のシートが更新されればダッシュボードも自動で変わります。
// 新しい「◯月実績」シートを作ったときだけ、もう一度 buildRealityDashboard を実行してください（月が追加されます）。

/** 今月（途中）のシート名 */
const RD_CURRENT_SHEET = 'REALITY売上計算（東京大阪MUSIC）';
/** 過去の月のシート名の形（例：REALITY売上計算（東京大阪MUSIC）9月実績、REALITY売上計算（東京大阪）7月結果） */
const RD_MONTH_SHEET = /^REALITY売上計算（[^）]*）\s*(\d{1,2})月(実績|結果)$/;
/** 作るシート名 */
const RD_DASHBOARD = 'REALITYダッシュボード';
/** 所属（元のシートのB列の名前） */
const RD_GROUPS = ['東京', '大阪', 'MUSIC'];

const RD_COLOR = {
  title: '#1F2A44',
  accent: '#E8833A',
  head: '#F4B183',
  tile: '#FFF4EA',
  line: '#D9D9D9',
  muted: '#7F7F7F',
  up: '#1E7B4A',
  down: '#C0392B',
  series: ['#4472C4', '#ED7D31', '#A5A5A5', '#1F2A44'],
};

function buildRealityDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(RD_CURRENT_SHEET)) throw new Error('「' + RD_CURRENT_SHEET + '」シートが見つかりません');

  const months = rdFindMonthSheets_(ss);
  const prev = months.length ? months[months.length - 1] : null;
  const cols = months.concat([{ label: '今月（途中）', sheet: RD_CURRENT_SHEET }]);

  let sheet = ss.getSheetByName(RD_DASHBOARD);
  if (sheet) {
    sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
    sheet.clear();
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  } else {
    sheet = ss.insertSheet(RD_DASHBOARD, 0);
  }
  rdEnsureSize_(sheet, 80, 20);
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, 80, 20).setFontFamily('Noto Sans JP').setFontSize(10).setVerticalAlignment('middle');
  [16, 120, 110, 110, 110, 110, 110, 110, 110, 24, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110]
    .forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  // ---- タイトル ----
  sheet.getRange('B1:S1').merge().setValue('REALITY 売上ダッシュボード')
    .setFontSize(18).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(RD_COLOR.title);
  sheet.setRowHeight(1, 44);
  sheet.getRange('B2:S2').merge()
    .setValue('今月＝「' + RD_CURRENT_SHEET + '」、前月＝「' + (prev ? prev.sheet : '（なし）') +
      '」。数字は元のシートと連動しています。新しい「◯月実績」シートを作ったら buildRealityDashboard を再実行してください。')
    .setFontColor(RD_COLOR.muted).setFontSize(9);

  // ---- 数字のパネル（今月 vs 前月） ----
  const cur = rdSheetRef_(RD_CURRENT_SHEET);
  const prv = prev ? rdSheetRef_(prev.sheet) : null;
  const tiles = [
    { label: 'TOTAL売上', col: 'L', fmt: '¥#,##0' },
    { label: '合計ギフト金額', col: 'H', fmt: '¥#,##0' },
    { label: 'ボーナス売上', col: 'J', fmt: '¥#,##0' },
    { label: '配信人数', col: 'C', fmt: '#,##0"人"' },
    { label: '1人あたり売上', col: null, fmt: '¥#,##0' },
  ];
  sheet.getRange('B4').setValue('今月（途中）の合計').setFontWeight('bold').setFontColor(RD_COLOR.title);
  tiles.forEach(function (t, i) {
    const c = 2 + i * 2; // B, D, F, H, J... は J を空けたいので2列ずつ（B:C, D:E, F:G, H:I, K:L）
    const col = c >= 10 ? c + 1 : c;
    const label = sheet.getRange(5, col, 1, 2).merge();
    const value = sheet.getRange(6, col, 1, 2).merge();
    const delta = sheet.getRange(7, col, 1, 2).merge();
    const curF = t.col ? rdPick_(cur, t.col, '合計') : rdPick_(cur, 'L', '合計') + '/' + rdPick_(cur, 'C', '合計');
    const prvF = prv ? (t.col ? rdPick_(prv, t.col, '合計') : rdPick_(prv, 'L', '合計') + '/' + rdPick_(prv, 'C', '合計')) : '';
    label.setValue(t.label).setFontColor(RD_COLOR.muted).setFontSize(9);
    value.setFormula('=IFERROR(' + curF + ',0)').setNumberFormat(t.fmt).setFontSize(20).setFontWeight('bold').setFontColor(RD_COLOR.title);
    if (prv) {
      delta.setFormula('=IFERROR("前月 "&TEXT(' + prvF + ',"' + t.fmt.replace(/"/g, '""') + '")&"（今月は"&TEXT(' + curF + '/' + prvF + ',"0%")&"）","")')
        .setFontSize(9).setFontColor(RD_COLOR.muted);
    }
    sheet.getRange(5, col, 3, 2).setBackground(RD_COLOR.tile).setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, RD_COLOR.head, SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setRowHeight(6, 40);

  // ---- 所属別（今月） ----
  const groupHead = ['所属', '配信人数', '合計ギフト金額', 'ボーナス売上', '配信売上', 'TOTAL売上', '1人あたり売上', '構成比'];
  const gTop = 10;
  sheet.getRange(gTop - 1, 2).setValue('所属別（今月・途中）').setFontWeight('bold').setFontColor(RD_COLOR.title);
  rdHeader_(sheet.getRange(gTop, 2, 1, groupHead.length).setValues([groupHead]));
  RD_GROUPS.concat(['合計']).forEach(function (g, i) {
    const r = gTop + 1 + i;
    sheet.getRange(r, 2).setValue(g).setFontWeight('bold');
    sheet.getRange(r, 3, 1, 7).setFormulas([[
      '=IFERROR(' + rdPick_(cur, 'C', g) + ',0)',
      '=IFERROR(' + rdPick_(cur, 'H', g) + ',0)',
      '=IFERROR(' + rdPick_(cur, 'J', g) + ',0)',
      '=IFERROR(' + rdPick_(cur, 'K', g) + ',0)',
      '=IFERROR(' + rdPick_(cur, 'L', g) + ',0)',
      '=IFERROR(G' + r + '/C' + r + ',0)',
      '=IFERROR(G' + r + '/$G$' + (gTop + 4) + ',0)',
    ]]);
  });
  sheet.getRange(gTop + 1, 3, 4, 1).setNumberFormat('#,##0');
  sheet.getRange(gTop + 1, 4, 4, 5).setNumberFormat('¥#,##0');
  sheet.getRange(gTop + 1, 9, 4, 1).setNumberFormat('0.0%');
  rdTable_(sheet.getRange(gTop + 1, 2, 4, groupHead.length));
  sheet.getRange(gTop + 4, 2, 1, groupHead.length).setFontWeight('bold').setBackground(RD_COLOR.tile);

  // ---- 月別の推移 ----
  const mTop = 17;
  const monthHead = ['月', '東京', '大阪', 'MUSIC', 'TOTAL売上（合計）', '配信人数', '1人あたり売上', '前月比'];
  sheet.getRange(mTop - 1, 2).setValue('月別の推移（TOTAL売上）').setFontWeight('bold').setFontColor(RD_COLOR.title);
  rdHeader_(sheet.getRange(mTop, 2, 1, monthHead.length).setValues([monthHead]));
  cols.forEach(function (m, i) {
    const r = mTop + 1 + i;
    const ref = rdSheetRef_(m.sheet);
    sheet.getRange(r, 2).setValue(m.label).setFontWeight('bold');
    sheet.getRange(r, 3, 1, 7).setFormulas([[
      '=IFERROR(' + rdPick_(ref, 'L', '東京') + ',0)',
      '=IFERROR(' + rdPick_(ref, 'L', '大阪') + ',0)',
      '=IFERROR(' + rdPick_(ref, 'L', 'MUSIC') + ',0)',
      '=IFERROR(' + rdPick_(ref, 'L', '合計') + ',0)',
      '=IFERROR(' + rdPick_(ref, 'C', '合計') + ',0)',
      '=IFERROR(F' + r + '/G' + r + ',0)',
      i === 0 ? '=""' : '=IFERROR(F' + r + '/F' + (r - 1) + '-1,"")',
    ]]);
  });
  const mRows = cols.length;
  sheet.getRange(mTop + 1, 3, mRows, 4).setNumberFormat('¥#,##0');
  sheet.getRange(mTop + 1, 7, mRows, 1).setNumberFormat('#,##0');
  sheet.getRange(mTop + 1, 8, mRows, 1).setNumberFormat('¥#,##0');
  sheet.getRange(mTop + 1, 9, mRows, 1).setNumberFormat('+0.0%;-0.0%;0.0%');
  rdTable_(sheet.getRange(mTop + 1, 2, mRows, monthHead.length));
  sheet.getRange(mTop + mRows, 2, 1, monthHead.length).setBackground(RD_COLOR.tile);
  const deltaRange = sheet.getRange(mTop + 1, 9, mRows, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor(RD_COLOR.up).setRanges([deltaRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor(RD_COLOR.down).setRanges([deltaRange]).build(),
  ]);

  // ---- 今月の売上上位10人 ----
  const tTop = mTop + mRows + 3;
  sheet.getRange(tTop - 1, 2).setValue('今月の合計ギフト 上位10人').setFontWeight('bold').setFontColor(RD_COLOR.title);
  rdHeader_(sheet.getRange(tTop, 2, 1, 5).setValues([['タレント名', '所属', '合計ギフト金額', 'ボーナス売上', '配信時間']]));
  sheet.getRange(tTop + 1, 2).setFormula(
    '=IFERROR(QUERY(' + cur + 'A16:L1004,"select B, A, H, J, E where H > 0 order by H desc limit 10",0),"データなし")'
  );
  sheet.getRange(tTop + 1, 4, 10, 2).setNumberFormat('¥#,##0');
  sheet.getRange(tTop + 1, 6, 10, 1).setNumberFormat('0.0"h"');
  rdTable_(sheet.getRange(tTop + 1, 2, 10, 5));

  SpreadsheetApp.flush();

  // ---- グラフ ----
  const chartCol = 11; // K列から右（数字のパネルの下）
  // 1. 月別 TOTAL売上（所属別の積み上げ）
  sheet.insertChart(sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(mTop, 2, mRows + 1, 4))
    .setNumHeaders(1)
    .setPosition(9, chartCol, 0, 0)
    .setOption('title', '月別 TOTAL売上（所属別）')
    .setOption('isStacked', true)
    .setOption('legend', { position: 'top' })
    .setOption('colors', RD_COLOR.series)
    .setOption('vAxis', { format: '¥#,##0' })
    .setOption('width', 720).setOption('height', 300)
    .build());
  // 2. 今月の所属別の構成
  sheet.insertChart(sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange(gTop, 2, 4, 1))
    .addRange(sheet.getRange(gTop, 7, 4, 1))
    .setNumHeaders(1)
    .setPosition(26, chartCol, 0, 0)
    .setOption('title', '今月の TOTAL売上 構成')
    .setOption('pieHole', 0.5)
    .setOption('colors', RD_COLOR.series)
    .setOption('legend', { position: 'right' })
    .setOption('width', 350).setOption('height', 260)
    .build());
  // 3. 配信人数と1人あたり売上の推移
  sheet.insertChart(sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange(mTop, 2, mRows + 1, 1))
    .addRange(sheet.getRange(mTop, 8, mRows + 1, 1))
    .setNumHeaders(1)
    .setPosition(26, chartCol + 4, 0, 0)
    .setOption('title', '1人あたり売上の推移')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [RD_COLOR.accent])
    .setOption('pointSize', 6)
    .setOption('vAxis', { format: '¥#,##0' })
    .setOption('width', 360).setOption('height', 260)
    .build());
  // 4. 今月の上位10人
  sheet.insertChart(sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange(tTop, 2, 11, 1))
    .addRange(sheet.getRange(tTop, 4, 11, 1))
    .setNumHeaders(1)
    .setPosition(41, chartCol, 0, 0)
    .setOption('title', '今月の合計ギフト 上位10人')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [RD_COLOR.series[0]])
    .setOption('hAxis', { format: '¥#,##0' })
    .setOption('width', 720).setOption('height', 340)
    .build());

  sheet.setFrozenRows(2);
  sheet.activate();
  ss.toast('「' + RD_DASHBOARD + '」を作りました（' + cols.length + 'ヶ月分）', 'REALITY 売上ダッシュボード', 6);
}

/** 「◯月実績／結果」のシートを月の順に並べる（今月より後の月は前の年として扱う） */
function rdFindMonthSheets_(ss) {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const found = {};
  ss.getSheets().forEach(function (s) {
    const m = s.getName().match(RD_MONTH_SHEET);
    if (!m) return;
    const month = Number(m[1]);
    const year = month > thisMonth ? now.getFullYear() - 1 : now.getFullYear();
    const key = year * 100 + month;
    // 同じ月が複数あれば、所属の多い（MUSIC入りの）新しい形式を優先
    if (!found[key] || s.getName().indexOf('MUSIC') >= 0) found[key] = { key: key, label: year + '年' + month + '月', sheet: s.getName() };
  });
  return Object.keys(found).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return found[k]; });
}

/** 数式用のシート参照（'シート名'!） */
function rdSheetRef_(name) {
  return "'" + name.replace(/'/g, "''") + "'!";
}

/** 元のシートの上の表（B4:B7 の所属名）から、指定の列の値を取り出す数式 */
function rdPick_(ref, col, group) {
  return 'INDEX(' + ref + '$' + col + '$4:$' + col + '$7,MATCH("' + group + '",' + ref + '$B$4:$B$7,0))';
}

function rdHeader_(range) {
  range.setBackground(RD_COLOR.head).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, RD_COLOR.line, SpreadsheetApp.BorderStyle.SOLID);
}

function rdTable_(range) {
  range.setBorder(true, true, true, true, true, true, RD_COLOR.line, SpreadsheetApp.BorderStyle.SOLID);
}

function rdEnsureSize_(sheet, rows, cols) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
}
