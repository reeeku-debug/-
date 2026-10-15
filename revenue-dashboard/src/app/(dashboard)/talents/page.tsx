import { Suspense } from "react";
import { APPS, ALL_APPS_ID } from "@/lib/revenue/apps";
import { concentration, streamDataAvailability, talentRows } from "@/lib/revenue/analytics";
import { people } from "@/lib/revenue/format";
import { revenuePageContext, type SearchParams } from "@/lib/revenue/page-context";
import { TALENT_FLAG_LABEL, type TalentFlag } from "@/lib/revenue/types";
import PeriodSelector from "@/components/revenue/period-selector";
import TalentRanking from "@/components/revenue/talent-ranking";
import { ConcentrationPanel, Section, StatTile } from "@/components/revenue/ui";

export default async function RevenueTalentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { model, period, query, months, param } = await revenuePageContext(searchParams);
  const rows = talentRows(model, period, ALL_APPS_ID);
  const conc = concentration(rows);
  const stream = streamDataAvailability(model);
  const flagged = rows.filter((r) => r.flags.length > 0);
  const flagCounts = (Object.keys(TALENT_FLAG_LABEL) as TalentFlag[]).map((f) => ({
    flag: f,
    count: rows.filter((r) => r.flags.includes(f)).length,
  }));
  const initialApp = APPS.some((a) => a.id === param(searchParams.app)) ? param(searchParams.app)! : "";
  const initialFlag = param(searchParams.flag) ?? "";

  return (
    <div className="space-y-6">
      <Suspense>
        <PeriodSelector months={months} label={period.label} compareLabel={period.compareLabel} />
      </Suspense>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="登録タレント" value={people(rows.length)} />
        <StatTile label="期間内に配信" value={people(rows.filter((r) => r.streamDays > 0).length)} />
        <StatTile label="売上発生" value={people(rows.filter((r) => r.revenue > 0).length)} />
        <StatTile label="要確認タレント" value={people(flagged.length)} hint={flagCounts.filter((c) => c.count > 0).map((c) => `${TALENT_FLAG_LABEL[c.flag]} ${c.count}`).join(" / ")} />
      </div>

      <Section title="タレント一覧" description="全媒体横断。名前をクリックすると詳細を表示">
        <TalentRanking
          key={`${initialApp}-${initialFlag}`}
          rows={rows}
          showApp
          showFilters
          showStreamTime={stream.minutes}
          initialApp={initialApp}
          initialFlag={initialFlag}
          periodQuery={query}
          compareLabel={period.compareLabel}
          pageSize={100}
        />
      </Section>

      <Section title="売上依存度" description="全媒体の売上に占める上位タレントの比率">
        <ConcentrationPanel c={conc} periodQuery={query} />
      </Section>
    </div>
  );
}
