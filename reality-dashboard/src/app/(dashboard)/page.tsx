import Link from "next/link";
import ConnectionNotice from "@/components/connection-notice";
import TierBoard from "@/components/tier-board";
import { buildMonthView, loadReality } from "@/lib/reality/data";

export const dynamic = "force-dynamic";

export default async function TierPage({ searchParams }: { searchParams: { m?: string } }) {
  const result = await loadReality();
  if (result.status !== "ok") return <ConnectionNotice result={result} />;

  const requested = /^\d{6}$/.test(searchParams.m ?? "") ? Number(searchParams.m) : null;
  const view = buildMonthView(result.data, requested);
  if (!view) {
    return (
      <div className="card space-y-2 py-10 text-center">
        <p className="font-semibold">まだ月次データがありません</p>
        <p className="text-sm text-gray-500">「CSV取込」から REALITY の配信レポートCSVを入れると、ここに月ごとのティアが表示されます。</p>
        <Link href="/import" className="btn-primary mt-2 px-4 py-2 text-sm">
          CSVを取り込む
        </Link>
      </div>
    );
  }
  return <TierBoard view={view} spreadsheetUrl={result.data.spreadsheetUrl} />;
}
