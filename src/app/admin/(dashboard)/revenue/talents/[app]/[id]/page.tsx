import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findApp } from "@/lib/revenue/apps";
import { talentDaily, talentMonthly, talentRows } from "@/lib/revenue/analytics";
import { formatDateJp, hoursMinutes, percent, yen } from "@/lib/revenue/format";
import { diffDays, monthOf, monthsBetween } from "@/lib/revenue/parse";
import { revenuePageContext, type SearchParams } from "@/lib/revenue/page-context";
import PeriodSelector from "@/components/revenue/period-selector";
import { StackedColumns } from "@/components/revenue/charts";
import TalentKpiForm from "@/components/revenue/talent-kpi-form";
import { AppDot, FlagBadges, Meter, Section, StatTile, TalentStatusBadge, changeText } from "@/components/revenue/ui";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{children}</dd>
    </div>
  );
}

export default async function RevenueTalentDetailPage({
  params,
  searchParams,
}: {
  params: { app: string; id: string };
  searchParams: SearchParams;
}) {
  const app = findApp(decodeURIComponent(params.app));
  if (!app) notFound();
  const talentId = decodeURIComponent(params.id);
  const { model, period, query, months } = await revenuePageContext(searchParams);
  const talent = model.talents.find((t) => t.app === app.id && t.talentId === talentId);
  if (!talent) notFound();

  const allRows = talentRows(model, period);
  const row = allRows.find((r) => r.talent.key === talent.key);
  const totalRevenue = allRows.reduce((s, r) => s + r.revenue, 0);
  const monthly = talentMonthly(model, talent, monthOf(period.end));
  const daily = talentDaily(model, talent, period.start, period.dataEnd);
  const hasMinutes = daily.some((d) => d.streamMinutes !== null);
  const hasCount = daily.some((d) => d.streamCount !== null);

  const firstMonth = row?.firstRevenueDate ? monthOf(row.firstRevenueDate) : null;
  const activeMonths = firstMonth ? monthsBetween(firstMonth, monthOf(period.dataEnd)).length : 0;
  const monthlyAverage = row && activeMonths > 0 ? row.cumulativeRevenue / activeMonths : null;
  const daysToFirstRevenue =
    talent.registeredAt && row?.firstRevenueDate ? diffDays(talent.registeredAt, row.firstRevenueDate) : null;
  const kpiMonth = period.month ?? monthOf(period.end);
  const ownKpi = model.kpis.find(
    (k) => k.month === kpiMonth && k.app === app.id && k.item === "talent_revenue" && k.talentId === talent.talentId
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={`/admin/revenue/talents${query}`} className="text-sm text-brand-600 underline">
          ← タレント一覧へ
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">{talent.name}</h2>
          <AppDot app={app.id} />
          <TalentStatusBadge status={talent.status} />
          {row && <FlagBadges flags={row.flags} />}
        </div>
        <Suspense>
          <PeriodSelector months={months} label={period.label} compareLabel={period.compareLabel} />
        </Suspense>
      </div>

      {!row && (
        <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
          選択した期間の末日時点では登録されていないタレントです（登録日：{formatDateJp(talent.registeredAt)}）。
        </p>
      )}

      {row && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="当期売上" value={yen(row.revenue)} delta={changeText(row.change)} deltaValue={row.change} emphasis />
            <StatTile label="前月売上" value={yen(row.compareRevenue)} hint={period.compareLabel} />
            <StatTile label="累計売上" value={yen(row.cumulativeRevenue)} />
            <StatTile label="月平均売上" value={yen(monthlyAverage)} hint={activeMonths ? `初収益月から${activeMonths}か月` : "売上実績なし"} />
            <StatTile label="全体売上に占める割合" value={percent(totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0)} hint={`${app.label}内 ${percent(row.share)}`} />
            <StatTile label="配信日数" value={`${row.streamDays}日`} hint={`1配信日あたり ${yen(row.revenuePerStreamDay)}`} />
            {hasMinutes && <StatTile label="配信時間" value={hoursMinutes(row.streamMinutes)} hint={`1時間あたり ${yen(row.revenuePerHour)}`} />}
            {hasCount && <StatTile label="配信回数" value={`${row.streamCount ?? 0}回`} />}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Section title="基本情報">
              <dl>
                <InfoRow label="タレント名">{talent.name}</InfoRow>
                <InfoRow label="タレントID">{talent.talentId}</InfoRow>
                <InfoRow label="アプリ"><AppDot app={app.id} /></InfoRow>
                <InfoRow label="登録日">{formatDateJp(talent.registeredAt)}</InfoRow>
                <InfoRow label="活動開始日">{formatDateJp(talent.activityStartAt)}</InfoRow>
                <InfoRow label="活動ステータス"><TalentStatusBadge status={talent.status} /></InfoRow>
                <InfoRow label="登録からの日数">{row.daysSinceRegistration !== null ? `${row.daysSinceRegistration}日` : "-"}</InfoRow>
                <InfoRow label="初収益日">{formatDateJp(row.firstRevenueDate)}</InfoRow>
                <InfoRow label="登録から初収益まで">{daysToFirstRevenue !== null ? `${daysToFirstRevenue}日` : "-"}</InfoRow>
                <InfoRow label="最終配信日">{formatDateJp(row.lastActiveDate)}</InfoRow>
              </dl>
              {talent.fromRawOnly && (
                <p className="mt-3 text-xs text-amber-700">TALENTSシートに未登録のため、登録日・ステータスは不明です。</p>
              )}
            </Section>

            <Section title="個人KPI" description="タレント売上目標に対する達成状況">
              {row.kpiTarget !== null ? (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-semibold tabular-nums">{percent(row.kpiRate, 0)}</span>
                    <span className="text-sm text-gray-500">目標 {yen(row.kpiTarget)}</span>
                  </div>
                  <Meter
                    rate={row.kpiRate}
                    status={(row.kpiRate ?? 0) >= 100 ? "achieved" : (row.kpiForecastRate ?? 0) >= 100 ? "on_track" : (row.kpiForecastRate ?? 0) < model.settings.kpiLowRate ? "critical" : "attention"}
                  />
                  <p className="text-xs text-gray-500">
                    {row.revenue < row.kpiTarget ? `目標比 −${yen(row.kpiTarget - row.revenue)}` : "目標達成"}
                    {period.inProgress && row.kpiForecastRate !== null && `／着地見込み ${percent(row.kpiForecastRate, 0)}`}
                  </p>
                  <p className="text-xs text-gray-400">{ownKpi ? "個別に設定された目標" : `${app.label}共通のタレント売上目標`}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">目標が設定されていません</p>
              )}
              <div className="mt-4 border-t pt-4">
                <TalentKpiForm app={app.id} talentId={talent.talentId} month={kpiMonth} current={ownKpi?.target ?? null} />
              </div>
            </Section>

            <Section title="月別売上" description="直近12か月">
              <StackedColumns
                labels={monthly.map((p) => `${Number(p.month.slice(5))}月`)}
                series={[{ id: app.id, label: app.label, color: app.color, values: monthly.map((p) => p.revenue) }]}
                format="yenCompact"
                height={220}
                ariaLabel={`${talent.name}の月別売上`}
              />
            </Section>
          </div>

          <Section title="日別データ" description={`${period.label}（CSVから取得できた項目のみ表示）`}>
            {daily.length === 0 ? (
              <p className="text-sm text-gray-500">期間内のデータがありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="py-2 text-left font-medium">日付</th>
                      <th className="py-2 text-right font-medium">売上</th>
                      {hasMinutes && <th className="py-2 text-right font-medium">配信時間</th>}
                      {hasCount && <th className="py-2 text-right font-medium">配信回数</th>}
                      {hasMinutes && <th className="py-2 text-right font-medium">1時間あたり</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {daily.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1.5">{formatDateJp(d.date)}</td>
                        <td className="py-1.5 text-right tabular-nums">{yen(d.revenue)}</td>
                        {hasMinutes && <td className="py-1.5 text-right tabular-nums">{hoursMinutes(d.streamMinutes)}</td>}
                        {hasCount && <td className="py-1.5 text-right tabular-nums">{d.streamCount ?? "-"}</td>}
                        {hasMinutes && (
                          <td className="py-1.5 text-right tabular-nums text-gray-500">
                            {d.streamMinutes ? yen(d.revenue / (d.streamMinutes / 60)) : "-"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
