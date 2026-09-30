import Link from "next/link";
import { Suspense } from "react";
import { APPS } from "@/lib/revenue/apps";
import { buildOverview } from "@/lib/revenue/dashboard";
import { people, signedPercent, yen, yenCompact } from "@/lib/revenue/format";
import { monthLabel } from "@/lib/revenue/period";
import { revenuePageContext, type SearchParams } from "@/lib/revenue/page-context";
import PeriodSelector from "@/components/revenue/period-selector";
import { DonutChart, HorizontalBars, LineChart, StackedColumns } from "@/components/revenue/charts";
import {
  AlertList,
  AppSummaryTable,
  ConcentrationPanel,
  KpiList,
  Section,
  ShortfallList,
  StatTile,
  changeText,
  diffText,
} from "@/components/revenue/ui";
import TalentRanking from "@/components/revenue/talent-ranking";

export default async function RevenueTopPage({ searchParams }: { searchParams: SearchParams }) {
  const { model, period, query, months } = await revenuePageContext(searchParams);
  const o = buildOverview(model, period);
  const t = o.total.metrics;
  const monthLabels = o.monthly.map((p) => `${Number(p.month.slice(5))}月${p.partial ? "*" : ""}`);
  const allKpis = [...o.total.kpis, ...APPS.flatMap((a) => o.apps[a.id].kpis)];

  return (
    <div className="space-y-6">
      <Suspense>
        <PeriodSelector months={months} label={period.label} compareLabel={period.compareLabel} />
      </Suspense>

      {/* 全体KPIカード */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="配信収益合計"
          value={yen(t.revenue)}
          delta={changeText(t.revenueChange)}
          deltaValue={t.revenueChange}
          hint={`比較期間 ${yen(t.compareRevenue)}`}
          emphasis
        />
        <StatTile label="累計配信収益" value={yenCompact(t.cumulativeRevenue)} hint={`${yen(t.cumulativeRevenue)}（期間末まで）`} />
        <StatTile label="前月配信収益" value={yen(t.previousFullRevenue)} hint={period.month ? `${monthLabel(period.compareStart.slice(0, 7))}全体` : period.compareLabel} />
        <StatTile label="1人あたり平均収益" value={yen(t.revenuePerRegistered)} hint="配信収益 ÷ 累計登録者数" />
        <StatTile
          label="新規登録人数"
          value={people(t.newRegistrations)}
          delta={`${diffText(t.registrationDiff, "人")}（${signedPercent(t.registrationChange)}）`}
          deltaValue={t.registrationDiff}
          emphasis
        />
        <StatTile label="累計登録人数" value={people(t.totalRegistrations)} hint={`配信中 ${people(t.streamingTalents)}`} />
        <StatTile label="前月新規登録人数" value={people(t.compareNewRegistrations)} hint={period.compareLabel} />
        <StatTile label="売上発生タレント" value={people(t.earners)} hint={`配信実績あり ${people(t.streamers)}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="アプリ別サマリー" description="アプリ名をクリックすると個別ページへ" className="xl:col-span-2">
          <AppSummaryTable total={t} apps={Object.fromEntries(APPS.map((a) => [a.id, o.apps[a.id].metrics]))} periodQuery={query} />
        </Section>
        <Section title="アプリ別売上構成" description={period.label}>
          <DonutChart
            items={APPS.map((a) => ({ id: a.id, label: a.label, color: a.color, value: o.apps[a.id].metrics.revenue }))}
            format="yenCompact"
            centerLabel="合計"
            ariaLabel="アプリ別売上構成比"
          />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="要確認" description="KPI未達・売上減少・活動できていないタレントなどを自動検出" className="xl:col-span-2">
          <AlertList alerts={o.alerts} limit={10} periodQuery={query} />
        </Section>
        <Section title="KPI状況（全体）" action={<Link href={`/admin/revenue/kpi${query}`} className="text-xs text-brand-600 underline">KPI管理</Link>}>
          <KpiList evaluations={o.total.kpis} />
        </Section>
      </div>

      <Section title="月別売上推移" description="直近12か月（* は集計途中の月）">
        <LineChart
          labels={monthLabels}
          series={APPS.map((a) => ({ id: a.id, label: a.label, color: a.color, values: o.monthly.map((p) => p.revenue[a.id]) }))}
          format="yenCompact"
          ariaLabel="アプリ別の月別売上推移"
        />
        <MonthlyTable o={o} labels={monthLabels} />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="登録者推移（月別新規登録）" description="媒体別の積み上げ">
          <StackedColumns
            labels={monthLabels}
            series={APPS.map((a) => ({ id: a.id, label: a.label, color: a.color, values: o.monthly.map((p) => p.newRegistrations[a.id]) }))}
            format="people"
            ariaLabel="アプリ別の月別新規登録人数"
          />
        </Section>
        <Section title="1人あたり収益" description={`${period.label}／配信収益 ÷ 累計登録者数`}>
          <HorizontalBars
            items={APPS.map((a) => ({
              id: a.id,
              label: a.label,
              color: a.color,
              value: o.apps[a.id].metrics.revenuePerRegistered,
              note: `${yenCompact(o.apps[a.id].metrics.revenue)} ÷ ${o.apps[a.id].metrics.totalRegistrations}人`,
            }))}
            format="yen"
            ariaLabel="アプリ別の1人あたり収益"
          />
          <div className="mt-6">
            <LineChart
              labels={monthLabels}
              series={APPS.map((a) => ({ id: a.id, label: a.label, color: a.color, values: o.monthly.map((p) => p.revenuePerRegistered[a.id]) }))}
              format="yenCompact"
              height={180}
              ariaLabel="アプリ別の1人あたり収益の推移"
            />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="不足している項目" description="全体・アプリ別KPIのうち目標に届いていないもの">
          <ShortfallList evaluations={allKpis} />
        </Section>
        <Section title="売上依存度" description="全体売上が特定タレントに偏っていないか">
          <ConcentrationPanel c={o.concentration} periodQuery={query} />
        </Section>
      </div>

      <Section
        title="タレント売上ランキング"
        description="全媒体横断・上位20名"
        action={<Link href={`/admin/revenue/talents${query}`} className="text-xs text-brand-600 underline">タレント分析へ</Link>}
      >
        <TalentRanking rows={o.rows} showApp periodQuery={query} compareLabel={period.compareLabel} pageSize={20} />
      </Section>
    </div>
  );
}

function MonthlyTable({ o, labels }: { o: ReturnType<typeof buildOverview>; labels: string[] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-gray-500">表で見る</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-1 text-left font-medium">月</th>
              {APPS.map((a) => (
                <th key={a.id} className="py-1 text-right font-medium">{a.label}</th>
              ))}
              <th className="py-1 text-right font-medium">合計</th>
              <th className="py-1 text-right font-medium">新規登録</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {o.monthly.map((p, i) => (
              <tr key={p.month}>
                <td className="py-1">{labels[i]}</td>
                {APPS.map((a) => (
                  <td key={a.id} className="py-1 text-right tabular-nums">{yen(p.revenue[a.id])}</td>
                ))}
                <td className="py-1 text-right font-semibold tabular-nums">
                  {yen(APPS.reduce((s, a) => s + p.revenue[a.id], 0))}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {APPS.reduce((s, a) => s + p.newRegistrations[a.id], 0)}人
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
