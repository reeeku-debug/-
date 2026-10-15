import { NextResponse, type NextRequest } from "next/server";
import { buildMonthView, loadReality, monthCsv } from "@/lib/reality/data";

export const dynamic = "force-dynamic";

/** 選んだ月のティア一覧をCSVで返す（ログインは middleware で確認済み） */
export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const result = await loadReality();
  if (result.status !== "ok") return new NextResponse("スプレッドシートに接続できません", { status: 503 });
  const view = buildMonthView(result.data, /^\d{6}$/.test(m) ? Number(m) : null);
  if (!view) return new NextResponse("データがありません", { status: 404 });
  return new NextResponse(monthCsv(view), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="REALITY_tier_${view.month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
