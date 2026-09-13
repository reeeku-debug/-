"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { approveReport, rejectReport } from "@/lib/progress";

type Result = { success: true } | { success: false; error: string };

async function revalidateReportPaths(reportId: string) {
  const report = await prisma.stepReport.findUnique({ where: { id: reportId } });
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  revalidatePath("/admin/talents");
  if (report) revalidatePath(`/admin/talents/${report.talentId}`);
}

export async function approveReportAction(reportId: string): Promise<Result> {
  const session = await requireAdminSession();
  try {
    await approveReport(reportId, session.user.id);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "承認に失敗しました。" };
  }
  await revalidateReportPaths(reportId);
  return { success: true };
}

export async function rejectReportAction(reportId: string, reviewComment: string): Promise<Result> {
  const session = await requireAdminSession();
  try {
    await rejectReport(reportId, session.user.id, reviewComment || undefined);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "差し戻しに失敗しました。" };
  }
  await revalidateReportPaths(reportId);
  return { success: true };
}
