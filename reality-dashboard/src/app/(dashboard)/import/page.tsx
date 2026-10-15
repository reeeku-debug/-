import ConnectionNotice from "@/components/connection-notice";
import ImportForm from "@/components/import-form";
import { loadReality } from "@/lib/reality/data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// 取込はスプレッドシート側の再計算を含むので長めに待つ
export const maxDuration = 60;

export default async function ImportPage() {
  const result = await loadReality();
  if (result.status !== "ok") return <ConnectionNotice result={result} />;
  const { log } = result.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">CSVを取り込む</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            REALITY からダウンロードした配信レポートCSV（月初からの累計）をそのまま選んでください。スプレッドシートの日次RAW・月次RAW・タレントマスタが更新され、ティアが自動で判定し直されます。同じ期間のCSVは重複として取り込みません。
          </p>
        </div>
        <ImportForm />
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">取込ログ（新しい順）</h2>
        {log.length === 0 ? (
          <p className="text-sm text-gray-500">まだ取り込みはありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="py-1.5 text-left font-medium">取込日時</th>
                  <th className="py-1.5 text-left font-medium">ファイル</th>
                  <th className="py-1.5 text-right font-medium">行数</th>
                  <th className="py-1.5 text-left font-medium">結果</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.map(([at, file, , rows, res], i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-1.5 tabular-nums">{at}</td>
                    <td className="break-all py-1.5">{file}</td>
                    <td className="py-1.5 text-right tabular-nums">{rows}</td>
                    <td className={cn("py-1.5", res.startsWith("OK") ? "text-emerald-700" : res.startsWith("エラー") ? "text-red-600" : "text-gray-600")}>
                      {res}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
