import { listRegistrants } from "@/lib/registrants";
import { formatDateTimeJST, jstDayKey } from "@/lib/date";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const registrants = await listRegistrants();

  const header = ["登録日時", "提出者", "REALITY URL", "REALITY ID", "活動名", "本名"];
  const rows = registrants.map((r) => [
    formatDateTimeJST(r.createdAt),
    r.submitter,
    r.realityUrl,
    r.realityId,
    r.stageName,
    r.realName,
  ]);

  const csvBody = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\r\n");

  // Excelでの文字化けを防ぐためUTF-8 BOMを付与
  const bom = "﻿";
  const filename = `reality_registrants_${jstDayKey(new Date()).replaceAll("-", "")}.csv`;

  return new Response(bom + csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
