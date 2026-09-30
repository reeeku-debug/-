import { Suspense } from "react";
import Link from "next/link";
import { APPS } from "@/lib/revenue/apps";
import { formatDateJp, formatDateTimeJst } from "@/lib/revenue/format";
import { loadRevenueData } from "@/lib/revenue/service";
import RevenueTabs, { type RevenueTab } from "@/components/revenue/revenue-tabs";
import RefreshButton from "@/components/revenue/refresh-button";

export const dynamic = "force-dynamic";

const TABS: RevenueTab[] = [
  { href: "/admin/revenue", label: "TOP / 全体", keepPeriod: true },
  ...APPS.map((a) => ({ href: `/admin/revenue/app/${a.id}`, label: a.label, keepPeriod: true })),
  { href: "/admin/revenue/talents", label: "タレント分析", keepPeriod: true },
  { href: "/admin/revenue/kpi", label: "KPI管理", keepPeriod: true },
  { href: "/admin/revenue/import", label: "データ取込・更新" },
  { href: "/admin/revenue/settings", label: "設定" },
];

export default async function RevenueLayout({ children }: { children: React.ReactNode }) {
  const data = await loadRevenueData();
  const { model, source } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">配信収益ダッシュボード</h1>
            <p className="text-sm text-gray-500">IRIAM・Avvy・Mirrativ の登録・収益・KPIを横断して確認</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span
              className={
                source.kind === "demo"
                  ? "rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200"
                  : "rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200"
              }
            >
              データソース：{source.label}
            </span>
            <span>
              最終更新：
              <span className="font-semibold text-gray-700">
                {formatDateTimeJst(model.lastImportedAt ?? data.loadedAt)}
              </span>
              {model.latestDataDate && <span className="ml-1">（データは{formatDateJp(model.latestDataDate)}分まで）</span>}
            </span>
            <RefreshButton />
          </div>
        </div>
        {data.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {data.error}
            <Link href="/admin/revenue/settings" className="ml-2 underline">
              設定を確認
            </Link>
          </div>
        )}
        {model.warnings.length > 0 && (
          <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <summary className="cursor-pointer">データに関する注意が{model.warnings.length}件あります</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {model.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
        <Suspense fallback={<div className="h-10 border-b" />}>
          <RevenueTabs tabs={TABS} />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
