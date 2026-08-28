import { getRegistrantStats } from "@/lib/registrants";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const stats = await getRegistrantStats();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">CSV出力</h1>
      <p className="mt-1 text-sm text-gray-500">
        登録者データ(全{stats.total}件)をCSVファイルとしてダウンロードできます。
      </p>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">
          出力項目: 登録日時 / 提出者 / REALITY URL / REALITY ID / 活動名 / 本名
        </p>
        <a
          href="/admin/export/download"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-6 py-3 text-base font-bold text-white transition hover:bg-brand-700"
        >
          CSVダウンロード
        </a>
      </div>
    </div>
  );
}
