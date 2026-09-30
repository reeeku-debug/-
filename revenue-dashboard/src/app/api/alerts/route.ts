// 要確認事項（アラート）を返すAPI。定期実行（Vercel Cron 等）から呼び出し、
// Slack Incoming Webhook へ通知することもできる。
//
//   GET /api/revenue/alerts            … JSONで取得
//   GET /api/revenue/alerts?notify=1   … SLACK_WEBHOOK_URL に通知
//
// 認証: Authorization: Bearer <REVENUE_CRON_SECRET または CRON_SECRET>

import { NextResponse, type NextRequest } from "next/server";
import { buildOverview } from "@/lib/revenue/dashboard";
import { formatDateTimeJst, yen } from "@/lib/revenue/format";
import { resolvePeriod } from "@/lib/revenue/period";
import { loadRevenueData } from "@/lib/revenue/service";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secrets = [process.env.REVENUE_CRON_SECRET, process.env.CRON_SECRET].filter((s): s is string => !!s);
  if (secrets.length === 0) return false;
  const header = req.headers.get("authorization") ?? "";
  return secrets.some((s) => header === `Bearer ${s}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await loadRevenueData({ fresh: true });
  const period = resolvePeriod({ p: req.nextUrl.searchParams.get("p") ?? undefined }, data.model.today);
  const overview = buildOverview(data.model, period);
  const minSeverity = req.nextUrl.searchParams.get("severity") ?? "warning";
  const levels = minSeverity === "info" ? ["critical", "warning", "info"] : minSeverity === "critical" ? ["critical"] : ["critical", "warning"];
  const alerts = overview.alerts.filter((a) => levels.includes(a.severity));

  const body = {
    period: period.label,
    lastUpdated: data.model.lastImportedAt ?? data.loadedAt,
    revenue: overview.total.metrics.revenue,
    revenueChange: overview.total.metrics.revenueChange,
    alerts,
    error: data.error,
  };

  let notified = false;
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (req.nextUrl.searchParams.get("notify") === "1" && webhook) {
    const base = process.env.DASHBOARD_URL ?? "";
    const lines = [
      `*配信収益ダッシュボード｜${period.label}*`,
      `配信収益 ${yen(body.revenue)}（最終更新 ${formatDateTimeJst(body.lastUpdated)}）`,
      ...(alerts.length === 0 ? ["✓ 要確認事項はありません"] : alerts.slice(0, 15).map((a) => `• [${a.severity === "critical" ? "要対応" : a.severity === "warning" ? "要確認" : "参考"}] ${a.message}`)),
      ...(alerts.length > 15 ? [`ほか ${alerts.length - 15} 件`] : []),
      ...(base ? [`<${base}/|ダッシュボードを開く>`] : []),
    ];
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
    notified = res.ok;
  }

  return NextResponse.json({ ...body, notified });
}
