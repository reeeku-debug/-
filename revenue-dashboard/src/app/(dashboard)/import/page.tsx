import Link from "next/link";
import { APPS } from "@/lib/revenue/apps";
import { formatDateJp, formatDateTimeJst } from "@/lib/revenue/format";
import { IMPORTED_AT_COLUMN } from "@/lib/revenue/normalize";
import { loadRevenueData } from "@/lib/revenue/service";
import CsvImportForm from "@/components/revenue/csv-import-form";
import { Section } from "@/components/revenue/ui";

export default async function RevenueImportPage() {
  const data = await loadRevenueData();
  const { model, raw } = data;

  const status = APPS.map((app) => {
    const table = raw.raw[app.id] ?? { headers: [], rows: [] };
    const report = model.mappingReports.find((r) => r.app === app.id);
    const records = model.records.filter((r) => r.app === app.id);
    const importedCol = table.headers.indexOf(IMPORTED_AT_COLUMN);
    let lastImport: string | null = null;
    if (importedCol >= 0) {
      for (const row of table.rows) {
        const v = row[importedCol];
        if (v && (!lastImport || Date.parse(v) > Date.parse(lastImport))) lastImport = v;
      }
    }
    const latest = records.reduce<string | null>((m, r) => (!m || r.date > m ? r.date : m), null);
    return { app, rows: table.rows.length, records: records.length, report, lastImport, latest };
  });

  return (
    <div className="space-y-6">
      <Section title="CSVアップロード" description="各アプリから出力したCSVをそのまま取り込みます。同じデータを何度取り込んでも二重計上されません。">
        {data.source.kind === "demo" && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            デモモードです。取り込んだデータはサーバーのメモリ上にのみ保持されます（再起動でリセット）。
            Googleスプレッドシートへ保存するには<Link href="/settings" className="underline">設定</Link>で接続してください。
          </p>
        )}
        <CsvImportForm apps={APPS.map((a) => ({ id: a.id, label: a.label }))} writable={data.source.writable} />
      </Section>

      <Section title="取込状況" description="RAWシートごとのデータ件数と最終取込日時">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="py-2 text-left font-medium">アプリ</th>
                <th className="py-2 text-left font-medium">シート</th>
                <th className="py-2 text-right font-medium">RAW行数</th>
                <th className="py-2 text-right font-medium">集計対象（重複除外後）</th>
                <th className="py-2 text-right font-medium">重複・読取不可</th>
                <th className="py-2 text-right font-medium">データ最終日</th>
                <th className="py-2 text-right font-medium">最終取込</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {status.map((s) => (
                <tr key={s.app.id}>
                  <td className="py-2 font-medium">{s.app.label}</td>
                  <td className="py-2 text-gray-500">{s.app.rawSheet}</td>
                  <td className="py-2 text-right tabular-nums">{s.rows.toLocaleString("ja-JP")}</td>
                  <td className="py-2 text-right tabular-nums">{s.records.toLocaleString("ja-JP")}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">
                    {s.report?.duplicateRows ?? 0} / {s.report?.skippedRows ?? 0}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatDateJp(s.latest)}</td>
                  <td className="py-2 text-right tabular-nums">{formatDateTimeJst(s.lastImport)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status.some((s) => (s.report?.errors.length ?? 0) > 0) && (
          <p className="mt-3 text-sm text-red-600">
            カラムを認識できないシートがあります。<Link href="/settings" className="underline">設定 → カラムマッピング</Link>を確認してください。
          </p>
        )}
      </Section>

      <Section title="運用フロー">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>各アプリの管理画面から前日分のCSVを出力する</li>
          <li>
            この画面でアプリを選んでアップロードする（または Google ドライブの所定フォルダに置き、Apps Script
            で自動取込する：<code className="rounded bg-gray-100 px-1">scripts/gas/import-csv.gs</code>）
          </li>
          <li>RAWシートに「CSVの列そのまま + 取込ID・取込日時」で追記される</li>
          <li>ダッシュボードが RAW → 共通フォーマット → 集計 の順に自動変換して表示する</li>
        </ol>
        <p className="mt-3 text-xs text-gray-500">
          重複判定キー：アプリ + 日付 + タレントID（+ レコードID を設定した場合はそれも含む）。同じキーのデータを再度取り込んだ場合、
          値が同じならスキップ、値が異なれば修正版として新しい取込を優先します。
        </p>
      </Section>
    </div>
  );
}
