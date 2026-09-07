export function ProgressHeader({
  name,
  total,
  cleared,
}: {
  name: string;
  total: number;
  cleared: number;
}) {
  const rate = total === 0 ? 0 : Math.round((cleared / total) * 100);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h1 className="text-lg font-bold">{name}さんの活動ロードマップ</h1>
      <p className="mt-3 text-sm text-gray-500">活動開始までの進捗</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-brand-600">
          {cleared} / {total}
        </span>
        <span className="text-sm font-semibold text-gray-500">STEP CLEAR</span>
      </div>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
          style={{ width: `${rate}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>進捗率 {rate}%</span>
        <span>🏅 スタンプ獲得数 {cleared}</span>
      </div>
    </section>
  );
}
