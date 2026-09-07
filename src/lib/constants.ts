// 初期状態で登録する10STEP + GOAL の定義（管理者は後から自由に編集可能）
export const DEFAULT_STEPS = [
  {
    order: 1,
    key: "activity_name",
    icon: "🏷️",
    title: "活動名を決定",
    description: "自分の活動名を決めよう！",
  },
  {
    order: 2,
    key: "catchphrase",
    icon: "✨",
    title: "キャッチコピー作成",
    description: "自分の魅力や活動内容が伝わるキャッチコピーを作成しよう！",
  },
  {
    order: 3,
    key: "profile",
    icon: "📝",
    title: "プロフィール作成",
    description: "配信PFやSNSで使用するプロフィールを作成しよう！",
  },
  {
    order: 4,
    key: "x_account",
    icon: "🐦",
    title: "Xアカウント作成",
    description: "活動用のXアカウントを作成しよう！",
  },
  {
    order: 5,
    key: "streaming_account",
    icon: "📱",
    title: "配信用PFアカウント作成",
    description: "REALITYなど、活動する配信プラットフォームのアカウントを作成しよう！",
  },
  {
    order: 6,
    key: "all_ready",
    icon: "🎒",
    title: "全ての準備完了",
    description:
      "以下がすべて完了していることを確認しよう。\n・活動名\n・キャッチコピー\n・プロフィール\n・Xアカウント\n・配信用PFアカウント",
  },
  {
    order: 7,
    key: "visit_50",
    icon: "🤝",
    title: "枠回り50人以上",
    description: "他のライバーの配信へ50人以上遊びに行こう！50人以上達成したら完了報告。",
  },
  {
    order: 8,
    key: "first_stream_plan",
    icon: "💡",
    title: "初配信内容を考える",
    description: "初配信で話す内容や企画、自己紹介などを考えよう！",
  },
  {
    order: 9,
    key: "first_stream_announce",
    icon: "📢",
    title: "初配信告知ポストをする",
    description: "Xで初配信の告知をしよう！",
  },
  {
    order: 10,
    key: "first_stream",
    icon: "🎤",
    title: "初配信する",
    description: "いよいよ初配信！初配信を実施したら完了。",
  },
  {
    order: 11,
    key: "goal",
    icon: "🏆",
    title: "GOAL",
    description: "🎉 VTuber活動スタート！ここからが本当のスタート！",
    type: "GOAL",
    requiresReport: false,
  },
] as const;

export const STEP_STATUS_LABEL: Record<string, string> = {
  LOCKED: "未挑戦",
  CHALLENGE: "挑戦中",
  REVIEW: "確認待ち",
  CLEAR: "CLEAR",
};

export const STEP_STATUS_BADGE_CLASS: Record<string, string> = {
  LOCKED: "bg-gray-100 text-gray-400 border-gray-200",
  CHALLENGE: "bg-amber-50 text-amber-700 border-amber-300",
  REVIEW: "bg-sky-50 text-sky-700 border-sky-300",
  CLEAR: "bg-emerald-50 text-emerald-700 border-emerald-300",
};

export const REPORT_STATUS_LABEL: Record<string, string> = {
  PENDING: "確認待ち",
  APPROVED: "承認済み",
  REJECTED: "差し戻し",
};
