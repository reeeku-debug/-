import { APPS, ALL_APPS_ID } from "@/lib/revenue/apps";
import { buildOverview } from "@/lib/revenue/dashboard";
import { KPI_DEFINITIONS } from "@/lib/revenue/kpi-definitions";
import { addMonths, monthOf } from "@/lib/revenue/parse";
import { resolvePeriod } from "@/lib/revenue/period";
import { revenuePageContext, type SearchParams } from "@/lib/revenue/page-context";
import KpiEditor from "@/components/revenue/kpi-editor";
import { AlertList, KpiList, Section, ShortfallList } from "@/components/revenue/ui";

export default async function RevenueKpiPage({ searchParams }: { searchParams: SearchParams }) {
  const { data, model, period: selected, months } = await revenuePageContext(searchParams);
  // KPIは月単位で管理する（任意期間が選ばれている場合は終了日の月）
  const month = selected.month ?? monthOf(selected.end);
  const period = resolvePeriod({ p: "month", m: month }, model.today);
  const o = buildOverview(model, period);
  const scopes = [...APPS.map((a) => ({ id: a.id, label: a.label, field: a.id })), { id: ALL_APPS_ID, label: "全体", field: "ALL" }];
  const editMonths = [addMonths(monthOf(model.today), 2), addMonths(monthOf(model.today), 1), ...months];
  const values: Record<string, number> = {};
  for (const k of model.kpis) if (k.month === month && !k.talentId) values[`${k.app}|${k.item}`] = k.target;
  const allKpis = [...o.total.kpis, ...APPS.flatMap((a) => o.apps[a.id].kpis)];
  const talentKpis = model.kpis.filter((k) => k.month === month && k.talentId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="不足している部分" description={`${period.label}／目標に届いていないKPI`}>
          <ShortfallList evaluations={allKpis} />
        </Section>
        <Section title="KPIアラート">
          <AlertList alerts={o.alerts.filter((a) => a.category === "kpi")} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <Section title="全体">
          <KpiList evaluations={o.total.kpis} />
        </Section>
        {APPS.map((a) => (
          <Section key={a.id} title={a.label}>
            <KpiList evaluations={o.apps[a.id].kpis} />
          </Section>
        ))}
      </div>

      <Section
        title="KPI設定"
        description="目標値はスプレッドシートの KPI シートに保存されます（シートを直接編集しても反映されます）"
      >
        {!data.source.writable && <p className="mb-3 text-sm text-red-600">現在のデータソースは書き込みできません</p>}
        {data.source.kind === "demo" && (
          <p className="mb-3 text-xs text-amber-700">デモモードでは保存内容はサーバーのメモリ上にのみ保持されます（再起動でリセット）。</p>
        )}
        <KpiEditor
          month={month}
          months={Array.from(new Set(editMonths))}
          scopes={scopes}
          items={KPI_DEFINITIONS.map((d) => ({ key: d.key, label: d.label, unit: d.unit, description: d.description }))}
          values={values}
          writable={data.source.writable}
        />
      </Section>

      {talentKpis.length > 0 && (
        <Section title="タレント個別KPI" description={`${period.label}に個別設定されている売上目標`}>
          <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
            {talentKpis.map((k) => {
              const t = model.talents.find((x) => x.app === k.app && x.talentId === k.talentId);
              return (
                <li key={`${k.app}-${k.talentId}`} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span>
                    {t?.name ?? k.talentId}
                    <span className="ml-1 text-xs text-gray-400">{k.app}</span>
                  </span>
                  <span className="tabular-nums">¥{k.target.toLocaleString("ja-JP")}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
