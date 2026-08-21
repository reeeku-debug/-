// 選択肢の初期セット。将来的に管理画面からのマスタ管理に置き換えやすいよう、
// フォーム・検索・マッチングの各所から共通で参照する。

export const HOBBY_OPTIONS = [
  "ゲーム",
  "アニメ",
  "映画",
  "カフェ巡り",
  "旅行",
  "コスプレ",
  "音楽",
  "スポーツ",
] as const;

export const SKILL_OPTIONS = [
  "歌",
  "ダンス",
  "イラスト",
  "声真似",
  "MC",
  "ナレーション",
  "動画編集",
  "ゲーム",
] as const;

export const DESIRED_WORK_OPTIONS = [
  "ゲーム案件",
  "アニメ案件",
  "商品PR",
  "YouTube案件",
  "TikTok案件",
  "イベント出演",
  "ライブ出演",
  "声優",
  "ナレーション",
  "MC",
  "歌唱",
  "コラボ案件",
  "企業案件",
  "美容案件",
  "ファッション案件",
  "飲食案件",
  "旅行案件",
  "その他",
] as const;

export const ACHIEVEMENT_CATEGORY_OPTIONS = [
  "イベント出演",
  "配信イベント",
  "YouTube",
  "TikTok",
  "企業案件",
  "ライブ出演",
  "MC",
  "声優",
  "その他",
] as const;

export const SOCIAL_PLATFORMS = [
  { value: "YOUTUBE", label: "YouTube" },
  { value: "X", label: "X" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "REALITY", label: "REALITY" },
  { value: "OTHER", label: "その他SNS" },
] as const;

export const PROJECT_ACTIVITY_OPTIONS = [
  "YouTube",
  "TikTok",
  "X",
  "Instagram",
  "配信",
  "イベント",
  "その他",
] as const;

export const PROJECT_STATUS_OPTIONS = [
  { value: "RECRUITING", label: "募集中", color: "bg-blue-100 text-blue-800" },
  { value: "SELECTING", label: "候補者選定中", color: "bg-purple-100 text-purple-800" },
  { value: "NEGOTIATING", label: "打診中", color: "bg-amber-100 text-amber-800" },
  { value: "DECIDED", label: "決定", color: "bg-green-100 text-green-800" },
  { value: "COMPLETED", label: "完了", color: "bg-gray-200 text-gray-700" },
  { value: "CANCELLED", label: "キャンセル", color: "bg-red-100 text-red-800" },
] as const;

export const CANDIDATE_STATUS_OPTIONS = [
  { value: "SUGGESTED", label: "AI提案", color: "bg-gray-100 text-gray-700" },
  { value: "SHORTLISTED", label: "候補者に追加", color: "bg-blue-100 text-blue-800" },
  { value: "FAVORITE", label: "お気に入り", color: "bg-pink-100 text-pink-800" },
  { value: "EXCLUDED", label: "除外", color: "bg-gray-200 text-gray-500" },
] as const;

export function statusLabel<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function statusColor<T extends { value: string; label: string; color: string }>(
  options: readonly T[],
  value: string
): string {
  return options.find((o) => o.value === value)?.color ?? "bg-gray-100 text-gray-700";
}

// 情報更新が必要と判断する経過日数
export const STALE_PROFILE_DAYS = 90;
