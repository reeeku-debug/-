import { NextRequest, NextResponse } from "next/server";
import { sendPendingReportsDigest } from "@/lib/notify";

/**
 * Vercel Cronから毎日13:00(JST)に呼ばれる（vercel.json参照）。
 * CRON_SECRETが設定されている場合、Vercelが自動的に付与するAuthorizationヘッダーで
 * 正当なcron実行のみを許可する。
 */
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await sendPendingReportsDigest(req.nextUrl.origin);
  return NextResponse.json(result);
}
