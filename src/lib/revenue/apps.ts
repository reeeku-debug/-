// 配信プラットフォームの定義。
// 媒体を追加する場合はこの配列に1件追加し、mapping.ts にデフォルトの
// カラムマッピングを追加するだけでダッシュボード全体に反映される。

export interface AppDefinition {
  /** URL・KPIシート・TALENTSシートで使う識別子 */
  id: string;
  /** 画面表示名 */
  label: string;
  /** RAWデータを保存するシート名 */
  rawSheet: string;
  /** グラフの系列色（カテゴリカル配色の固定順） */
  color: string;
}

export const APPS: AppDefinition[] = [
  { id: "IRIAM", label: "IRIAM", rawSheet: "IRIAM_RAW", color: "#2a78d6" },
  { id: "Avvy", label: "Avvy", rawSheet: "AVVY_RAW", color: "#eb6834" },
  { id: "Mirrativ", label: "Mirrativ", rawSheet: "MIRRATIV_RAW", color: "#1baf7a" },
];

/** KPIシート等で「全媒体合計」を表すアプリ名 */
export const ALL_APPS_ID = "全体";

export type AppId = string;

function normalizeAppName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

/** 表記ゆれ（大文字小文字・空白）を吸収してアプリを特定する */
export function findApp(value: string | null | undefined): AppDefinition | undefined {
  if (!value) return undefined;
  const key = normalizeAppName(value);
  return APPS.find((a) => normalizeAppName(a.id) === key || normalizeAppName(a.label) === key);
}

export function isAllApps(value: string | null | undefined): boolean {
  if (!value) return false;
  const key = normalizeAppName(value);
  return key === normalizeAppName(ALL_APPS_ID) || key === "all" || key === "合計" || key === "total";
}

export function appColor(appId: string): string {
  return findApp(appId)?.color ?? "#898781";
}
