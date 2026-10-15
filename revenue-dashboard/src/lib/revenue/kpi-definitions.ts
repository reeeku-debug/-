// KPI項目の定義。KPIシートの「KPI項目」列はここの label / aliases と照合される。
// 新しいKPIを追加する場合はこの配列に1件追加し、metrics.ts の ScopeMetrics に
// 対応する実績値を用意する。定義にない項目もKPIシートに登録でき、
// 画面上は「実績未対応の項目」として目標値のみ表示される。

export type KpiUnit = "yen" | "person";

export interface KpiDefinition {
  key: string;
  label: string;
  aliases: string[];
  unit: KpiUnit;
  /** タレント個別に設定するKPI（アプリ単位で設定した値は各タレントのデフォルト目標になる） */
  perTalent?: boolean;
  description: string;
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  {
    key: "revenue",
    label: "売上",
    aliases: ["売上", "配信収益", "月間売上", "revenue"],
    unit: "yen",
    description: "期間内の配信収益合計",
  },
  {
    key: "new_registrations",
    label: "新規登録",
    aliases: ["新規登録", "新規登録数", "月間新規登録", "登録", "new_registrations"],
    unit: "person",
    description: "登録日が期間内のタレント数",
  },
  {
    key: "activations",
    label: "活動開始",
    aliases: ["活動開始", "活動開始数", "月間活動開始", "activations"],
    unit: "person",
    description: "活動開始日が期間内のタレント数",
  },
  {
    key: "streamers",
    label: "配信者数",
    aliases: ["配信者数", "稼働人数", "稼働タレント", "月間配信者数", "streamers"],
    unit: "person",
    description: "期間内に1日以上配信（または売上発生）したタレント数",
  },
  {
    key: "earners",
    label: "売上発生人数",
    aliases: ["売上発生人数", "売上発生タレント", "月間売上発生人数", "earners"],
    unit: "person",
    description: "期間内の売上が1円以上のタレント数",
  },
  {
    key: "talent_revenue",
    label: "タレント売上",
    aliases: ["タレント売上", "タレント別売上", "個人売上", "talent_revenue"],
    unit: "yen",
    perTalent: true,
    description: "タレント1人あたりの月間売上目標（タレントID指定で個別設定）",
  },
];

function aliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s　]/g, "");
}

export function findKpiDefinition(value: string): KpiDefinition | undefined {
  const key = aliasKey(value);
  return KPI_DEFINITIONS.find((d) => d.key === key || d.aliases.some((a) => aliasKey(a) === key));
}

export function kpiDefinitionByKey(key: string): KpiDefinition | undefined {
  return KPI_DEFINITIONS.find((d) => d.key === key);
}
