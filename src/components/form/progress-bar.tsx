const STEP_LABELS = [
  "基本情報",
  "実績・経験",
  "趣味・特技",
  "夢・目標",
  "やってみたい仕事",
  "SNS情報",
  "入力内容確認",
  "送信完了",
];

export default function ProgressBar({ step }: { step: number }) {
  const total = STEP_LABELS.length;
  const percent = Math.round((step / total) * 100);

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
        <span>
          STEP {step} / {total} — {STEP_LABELS[step - 1]}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
