import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findApp } from "@/lib/revenue/apps";
import { streamDataAvailability } from "@/lib/revenue/analytics";
import { buildAppOverview } from "@/lib/revenue/dashboard";
import { people, yen, yenCompact } from "@/lib/revenue/format";
import { revenuePageContext, type SearchParams } from "@/lib/revenue/page-context";
import PeriodSelector from "@/components/revenue/period-selector";
import { StackedColumns } from "@/components/revenue/charts";
import TalentRanking from "@/components/revenue/talent-ranking";
import {
  AlertList,
  ConcentrationPanel,
  KpiList,
  Section,
  ShortfallList,
  StatTile,
  changeText,
  diffText,
} from "@/components/revenue/ui";

export default async function RevenueAppPage({
  params,
  searchParams,
}: {
  params: { app: string };
  searchParams: SearchParams;
}) {
  const app = findApp(decodeURIComponent(params.app));
  if (!app) notFound();
  const { model, period, query, months } = await revenuePageContext(searchParams);
  const o = buildAppOverview(model, period, app.id);
  const m = o.summary.metrics;
  const stream = streamDataAvailability(model, app.id);
  const labels = o.monthly.map((p) => `${Number(p.month.slice(5))}月${p.partial ? "*" : ""}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: app.color }} />
          {app.label}
        </h2>
        <Suspense>
          <PeriodSelector months={months} label={period.label} compareLabel={period.compareLabel} />
        </Suspense>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="配信収益" value={yen(m.revenue)} delta={changeText(m.revenueChange)} deltaValue={m.revenueChange} emphasis />
        <StatTile label="前月収益" value={yen(m.compareRevenue)} hint={period.compareLabel} />
        <StatTile label="累計配信収益" value={yenCompact(m.cumulativeRevenue)} hint={yen(m.cumulativeRevenue)} />
        <StatTile label="1人あたり収益" value={yen(m.revenuePerRegistered)} hint="配信収益 ÷ 累計登録者数" />
        <StatTile
          label="新規登録"
          value={people(m.newRegistrations)}
          delta={diffText(m.registrationDiff, "人")}
          deltaValue={m.registrationDiff}
          emphasis
        />
        <StatTile label="累計登録" value={people(m.totalRegistrations)} />
        <StatTile label="配信中タレント数" value={people(m.streamingTalents)} hint={`期間内に配信 ${people(m.streamers)}`} />
        <StatTile label="売上発生タレント数" value={people(m.earners)} hint={`登録者の${m.totalRegistrations ? Math.round((m.earners / m.totalRegistrations) * 100) : 0}%`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="KPI状況" description={period.label}>
          <KpiList evaluations={o.summary.kpis} />
        </Section>
        <Section title="要確認" className="xl:col-span-2">
          <div className="space-y-4">
            <ShortfallList evaluations={o.summary.kpis} />
            <AlertList alerts={o.alerts.filter((a) => a.category !== "kpi")} limit={8} periodQuery={query} />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="月別配信収益" description="直近12か月（* は集計途中の月）">
          <StackedColumns
            labels={labels}
            series={[{ id: app.id, label: app.label, color: app.color, values: o.monthly.map((p) => p.revenue[app.id]) }]}
            format="yenCompact"
            ariaLabel={`${app.label}の月別配信収益`}
          />
        </Section>
        <Section title="月別新規登録">
          <StackedColumns
            labels={labels}
            series={[{ id: app.id, label: app.label, color: app.color, values: o.monthly.map((p) => p.newRegistrations[app.id]) }]}
            format="people"
            ariaLabel={`${app.label}の月別新規登録`}
          />
        </Section>
      </div>

      <Section title="売上依存度" description={`${app.label}内の売上の偏り`}>
        <ConcentrationPanel c={o.concentration} periodQuery={query} />
      </Section>

      <Section title="タレントランキング" description="列見出しまたはプルダウンで並び替え">
        <TalentRanking
          rows={o.rows}
          periodQuery={query}
          compareLabel={period.compareLabel}
          showStreamTime={stream.minutes}
        />
      </Section>
    </div>
  );
}
