import CriteriaForm from "@/components/criteria-form";
import { gasConfig, loadReality } from "@/lib/reality/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SettingsPage() {
  const { config, error } = gasConfig();
  const result = config ? await loadReality() : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">判定基準</h2>
          <p className="mt-1 text-xs text-gray-500">
            スプレッドシートの「設定」シートと同じ値です。変えるとスプレッドシートにも保存され、すべての月のティアが判定し直されます。T1→T2→T3→T4→T5の順に判定し、最初に当てはまったティアになります。
          </p>
        </div>
        {result?.status === "ok" ? (
          <CriteriaForm criteria={result.data.criteria} />
        ) : (
          <p className="text-sm text-gray-500">スプレッドシートに接続すると変更できます。</p>
        )}
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="font-semibold">スプレッドシートとの接続</h2>
        <p>
          状態：
          {error ? (
            <span className="font-semibold text-red-600">設定に誤りがあります（{error}）</span>
          ) : !config ? (
            <span className="font-semibold text-amber-700">未接続</span>
          ) : result?.status === "ok" ? (
            <span className="font-semibold text-emerald-700">接続できています</span>
          ) : (
            <span className="font-semibold text-red-600">接続エラー（{result?.status === "error" ? result.message : ""}）</span>
          )}
        </p>
        {result?.status === "ok" && result.data.spreadsheetUrl && (
          <p>
            <a href={result.data.spreadsheetUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">
              接続中のスプレッドシートを開く
            </a>
          </p>
        )}
        <ol className="list-decimal space-y-1.5 pl-5 text-gray-700">
          <li>REALITY のスプレッドシートで「拡張機能 → Apps Script」に REALITY_日次取込.gs を貼り付ける</li>
          <li>
            スクリプト先頭の <code>TOKEN</code> を長い合言葉（英数字）に書き換えて保存する
          </li>
          <li>「デプロイ → 新しいデプロイ → ウェブアプリ」で、実行ユーザー「自分」・アクセス「全員」にしてデプロイし、権限を許可する</li>
          <li>
            表示された「ウェブアプリ URL」（…/exec）を Vercel の <code>GAS_WEBAPP_URL</code>、合言葉を <code>GAS_TOKEN</code> に設定して Redeploy
          </li>
        </ol>
        <p className="text-xs text-gray-500">
          スクリプトを書き換えたときは「デプロイ → デプロイを管理 → 鉛筆 → バージョン：新バージョン → デプロイ」で更新してください（URLは変わりません）。
        </p>
      </section>
    </div>
  );
}
