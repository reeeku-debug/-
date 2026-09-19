// 選択肢の初期セット。将来的に管理画面からのマスタ管理に置き換えやすいよう、
// フォーム・検索の各所から共通で参照する。

export const GENDER_OPTIONS = ["男性", "女性", "その他", "未回答"] as const;

export const PREFECTURE_OPTIONS = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
  "海外",
] as const;

export const BANK_ACCOUNT_TYPE_OPTIONS = ["普通", "当座", "その他"] as const;

export const TALENT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "在籍", color: "bg-green-100 text-green-800" },
  { value: "SUSPENDED", label: "休止", color: "bg-amber-100 text-amber-800" },
  { value: "WITHDRAWN", label: "退所", color: "bg-gray-200 text-gray-600" },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: "UNPAID", label: "未入金", color: "bg-red-100 text-red-700" },
  { value: "PAID", label: "入金済み", color: "bg-green-100 text-green-800" },
  { value: "NOT_APPLICABLE", label: "対象外", color: "bg-gray-100 text-gray-500" },
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
