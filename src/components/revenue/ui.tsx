import Link from "next/link";
import { cn } from "@/lib/utils";
import { APPS, ALL_APPS_ID } from "@/lib/revenue/apps";
import type { AlertSeverity, RevenueAlert } from "@/lib/revenue/alerts";
import type { Concentration, ScopeMetrics, TalentFlag } from "@/lib/revenue/analytics";
import { TALENT_FLAG_LABEL } from "@/lib/revenue/analytics";
import { KPI_STATUS_LABEL, type KpiEvaluation, type KpiStatus } from "@/lib/revenue/kpi";
import { people, percent, signedNumber, signedPercent, trendClass, yen, yenCompact } from "@/lib/revenue/format";

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** KPIカード：ラベル・値・比較（前月比など） */
export function StatTile({
  label,
  value,
  delta,
  deltaValue,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  /** 表示する増減テキスト */
  delta?: string;
  /** 増減の符号（色分け用） */
  deltaValue?: number | null;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={cn("card", emphasis && "border-brand-200")}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn("mt-1 font-semibold tabular-nums text-gray-900", emphasis ? "text-3xl" : "text-2xl")}>{value}</p>
      {delta && <p className={cn("mt-1 text-xs font-medium", trendClass(deltaValue))}>{delta}</p>}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const KPI_STATUS_STYLE: Record<KpiStatus, string> = {
  achieved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  on_track: "bg-sky-50 text-sky-700 ring-sky-200",
  attention: "bg-amber-50 text-amber-800 ring-amber-200",
  critical: "bg-red-50 text-red-700 ring-red-200",
  no_target: "bg-gray-50 text-gray-500 ring-gray-200",
};

const KPI_STATUS_ICON: Record<KpiStatus, string> = {
  achieved: "✓",
  on_track: "↗",
  attention: "!",
  critical: "‼",
  no_target: "–",
};

export function KpiStatusBadge({ status }: { status: KpiStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", KPI_STATUS_STYLE[status])}>
      <span aria-hidden>{KPI_STATUS_ICON[status]}</span>
      {KPI_STATUS_LABEL[status]}
    </span>
  );
}

const METER_COLOR: Record<KpiStatus, string> = {
  achieved: "bg-emerald-500",
  on_track: "bg-sky-500",
  attention: "bg-amber-400",
  critical: "bg-red-500",
  no_target: "bg-gray-300",
};

export function Meter({ rate, status }: { rate: number | null; status: KpiStatus }) {
  const w = Math.max(0, Math.min(100, rate ?? 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={cn("h-2 rounded-full", METER_COLOR[status])} style={{ width: `${w}%` }} />
    </div>
  );
}

function kpiValue(e: KpiEvaluation, n: number | null): string {
  if (n === null) return "-";
  return e.unit === "yen" ? yen(n) : people(n);
}

/** KPI達成状況の一覧（不足分・必要ペースを含む） */
export function KpiList({ evaluations, showScope }: { evaluations: KpiEvaluation[]; showScope?: boolean }) {
  const withTarget = evaluations.filter((e) => e.status !== "no_target");
  const without = evaluations.filter((e) => e.status === "no_target");
  if (withTarget.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        KPIが未設定です。
        <Link href="/admin/revenue/kpi" className="ml-1 text-brand-600 underline">
          KPI管理で目標を設定
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {withTarget.map((e) => (
        <div key={`${e.scope}-${e.item}`}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-800">
              {showScope && <span className="mr-1 text-gray-500">{e.scope}</span>}
              {e.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-semibold text-gray-900">{percent(e.rate, 0)}</span>
              <KpiStatusBadge status={e.status} />
            </span>
          </div>
          <Meter rate={e.rate} status={e.status} />
          <p className="mt-1 text-xs text-gray-500">
            実績 {kpiValue(e, e.actual)} / 目標 {kpiValue(e, e.target)}
            {e.targetDerived && "（アプリ別目標の合計）"}
            {e.shortfall !== null && e.shortfall > 0 && (
              <span className="ml-2 font-medium text-red-600">目標比 −{kpiValue(e, e.shortfall)}</span>
            )}
            {e.forecast !== null && (
              <span className="ml-2">
                着地見込み {kpiValue(e, e.forecast)}（{percent(e.forecastRate, 0)}）
              </span>
            )}
            {e.requiredPerDay !== null && (
              <span className="ml-2">
                残り{e.remainingDays}日で1日あたり {kpiValue(e, e.requiredPerDay)} 必要
              </span>
            )}
          </p>
        </div>
      ))}
      {without.length > 0 && (
        <p className="text-xs text-gray-400">目標未設定：{without.map((e) => e.label).join("、")}</p>
      )}
    </div>
  );
}

/** 不足している部分だけを抜き出して表示 */
export function ShortfallList({ evaluations }: { evaluations: KpiEvaluation[] }) {
  const short = evaluations.filter((e) => (e.status === "attention" || e.status === "critical") && (e.shortfall ?? 0) > 0);
  if (short.length === 0) {
    return <p className="text-sm text-emerald-700">✓ 目標に対して不足している項目はありません</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {short.map((e) => (
        <li key={`${e.scope}-${e.item}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <span>
            <span className="font-medium">{e.scope === ALL_APPS_ID ? "全体" : e.scope}</span>
            <span className="mx-1 text-gray-400">/</span>
            {e.label}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-red-600">目標比 −{kpiValue(e, e.shortfall)}</span>
            <KpiStatusBadge status={e.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const ALERT_STYLE: Record<AlertSeverity, { box: string; icon: string; label: string }> = {
  critical: { box: "border-red-200 bg-red-50", icon: "‼", label: "要対応" },
  warning: { box: "border-amber-200 bg-amber-50", icon: "!", label: "要確認" },
  info: { box: "border-gray-200 bg-gray-50", icon: "i", label: "参考" },
};

export function AlertList({ alerts, limit, periodQuery = "" }: { alerts: RevenueAlert[]; limit?: number; periodQuery?: string }) {
  if (alerts.length === 0) return <p className="text-sm text-emerald-700">✓ 要確認事項はありません</p>;
  const shown = limit ? alerts.slice(0, limit) : alerts;
  const withQuery = (href: string) => {
    if (!periodQuery) return href;
    return href.includes("?") ? `${href}&${periodQuery.slice(1)}` : `${href}${periodQuery}`;
  };
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {shown.map((a, i) => {
          const s = ALERT_STYLE[a.severity];
          const body = (
            <>
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200">
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </span>
              <span className="text-gray-800">{a.message}</span>
            </>
          );
          return (
            <li key={i} className={cn("rounded-lg border px-3 py-2 text-sm", s.box)}>
              {a.href ? (
                <Link href={withQuery(a.href)} className="flex items-start gap-2 hover:underline">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {limit && alerts.length > limit && <p className="text-xs text-gray-500">ほか {alerts.length - limit} 件</p>}
    </div>
  );
}

export function FlagBadges({ flags }: { flags: TalentFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
          {TALENT_FLAG_LABEL[f]}
        </span>
      ))}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  登録前: "bg-gray-100 text-gray-500",
  登録済: "bg-sky-50 text-sky-700",
  配信準備中: "bg-violet-50 text-violet-700",
  配信開始: "bg-emerald-50 text-emerald-700",
  休止: "bg-amber-50 text-amber-800",
  卒業: "bg-gray-100 text-gray-500",
};

export function TalentStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600")}>
      {status}
    </span>
  );
}

export function AppDot({ app }: { app: string }) {
  const def = APPS.find((a) => a.id === app);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: def?.color ?? "#898781" }} />
      {def?.label ?? app}
    </span>
  );
}

/** アプリ別サマリー（IRIAM / Avvy / Mirrativ / 合計） */
export function AppSummaryTable({
  total,
  apps,
  periodQuery,
}: {
  total: ScopeMetrics;
  apps: Record<string, ScopeMetrics>;
  periodQuery: string;
}) {
  const cols = [...APPS.map((a) => ({ id: a.id, m: apps[a.id] })), { id: ALL_APPS_ID, m: total }];
  const rows: Array<{ label: string; render: (m: ScopeMetrics) => React.ReactNode }> = [
    { label: "当期新規登録", render: (m) => people(m.newRegistrations) },
    { label: "累計登録", render: (m) => people(m.totalRegistrations) },
    { label: "当期配信収益", render: (m) => yen(m.revenue) },
    { label: "前月配信収益", render: (m) => yen(m.compareRevenue) },
    {
      label: "前月比",
      render: (m) => <span className={trendClass(m.revenueChange)}>{signedPercent(m.revenueChange)}</span>,
    },
    { label: "1人平均収益", render: (m) => yen(m.revenuePerRegistered) },
    { label: "配信者数", render: (m) => people(m.streamers) },
    { label: "売上発生人数", render: (m) => people(m.earners) },
    { label: "累計配信収益", render: (m) => yenCompact(m.cumulativeRevenue) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-500">
            <th className="py-2 text-left font-medium">項目</th>
            {cols.map((c) => (
              <th key={c.id} className="py-2 text-right font-medium">
                {c.id === ALL_APPS_ID ? (
                  "合計"
                ) : (
                  <Link href={`/admin/revenue/app/${c.id}${periodQuery}`} className="hover:underline">
                    <AppDot app={c.id} />
                  </Link>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-2 text-gray-600">{r.label}</td>
              {cols.map((c) => (
                <td key={c.id} className={cn("py-2 text-right tabular-nums", c.id === ALL_APPS_ID && "font-semibold")}>
                  {r.render(c.m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConcentrationPanel({ c, periodQuery }: { c: Concentration; periodQuery: string }) {
  if (c.total <= 0) return <p className="text-sm text-gray-500">期間内の売上がありません</p>;
  const tiles = [
    { label: "上位1人", value: c.top1 },
    { label: "上位3人", value: c.top3 },
    { label: "上位10人", value: c.top10 },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-gray-50 px-3 py-2 text-center">
            <p className="text-xs text-gray-500">{t.label}の売上比率</p>
            <p className="text-lg font-semibold tabular-nums">{percent(t.value)}</p>
          </div>
        ))}
      </div>
      <ol className="space-y-1.5 text-sm">
        {c.leaders.slice(0, 5).map((l, i) => (
          <li key={l.talent.key} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs text-gray-400">{i + 1}</span>
            <Link
              href={`/admin/revenue/talents/${encodeURIComponent(l.talent.app)}/${encodeURIComponent(l.talent.talentId)}${periodQuery}`}
              className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline"
            >
              {l.talent.name}
            </Link>
            <span className="text-xs text-gray-500">
              <AppDot app={l.talent.app} />
            </span>
            <span className="w-24 text-right tabular-nums">{yen(l.revenue)}</span>
            <span className="w-14 text-right text-xs tabular-nums text-gray-500">{percent(l.share)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function changeText(change: number | null, suffix = "前月比"): string {
  return `${suffix} ${signedPercent(change)}`;
}

export function diffText(diff: number, unit: string, suffix = "前月差"): string {
  return `${suffix} ${signedNumber(diff, unit)}`;
}
