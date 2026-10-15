import Link from "next/link";
import type { LoadResult } from "@/lib/reality/data";

/** スプレッドシートにつながっていないときの案内 */
export default function ConnectionNotice({ result }: { result: Exclude<LoadResult, { status: "ok" }> }) {
  if (result.status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
        <p className="font-semibold">スプレッドシートからデータを読み込めませんでした</p>
        <p className="mt-1">{result.message}</p>
        <Link href="/settings" className="mt-2 inline-block underline">
          接続の設定を確認する
        </Link>
      </div>
    );
  }
  return (
    <div className="card space-y-2 text-sm">
      <p className="font-semibold">スプレッドシートにまだ接続されていません</p>
      <p className="text-gray-600">
        Vercel の環境変数に <code>GAS_WEBAPP_URL</code> と <code>GAS_TOKEN</code> を設定すると、REALITY のスプレッドシートのデータが表示されます。
      </p>
      <Link href="/settings" className="inline-block font-medium text-brand-600 underline">
        接続の手順を見る
      </Link>
    </div>
  );
}
