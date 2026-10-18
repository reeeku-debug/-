import { prisma } from "@/lib/prisma";

/**
 * タレントがスタンプ獲得を申請する。
 * 既に獲得済み（APPROVED）の場合や、審査中（PENDING）の申請がすでにある場合は申請できない。
 */
export async function submitStampClaim(
  talentId: string,
  stampItemId: string,
  data: { comment?: string; imageUrl?: string; relatedUrl?: string }
) {
  const existing = await prisma.stampClaim.findFirst({
    where: { talentId, stampItemId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (existing?.status === "APPROVED") {
    throw new Error("このスタンプはすでに獲得済みです。");
  }
  if (existing?.status === "PENDING") {
    throw new Error("このスタンプはすでに申請中です。");
  }

  await prisma.stampClaim.create({
    data: {
      talentId,
      stampItemId,
      comment: data.comment || null,
      imageUrl: data.imageUrl || null,
      relatedUrl: data.relatedUrl || null,
      status: "PENDING",
    },
  });
}

/** マネージャー：スタンプ獲得申請を承認する */
export async function approveStampClaim(claimId: string, adminId: string) {
  const claim = await prisma.stampClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (claim.status !== "PENDING") {
    throw new Error("この申請はすでに確認済みです。");
  }
  await prisma.stampClaim.update({
    where: { id: claimId },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewedByAdminId: adminId },
  });
}

/** マネージャー：スタンプ獲得申請を差し戻す。タレントは再申請できる。 */
export async function rejectStampClaim(claimId: string, adminId: string, reviewComment?: string) {
  const claim = await prisma.stampClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (claim.status !== "PENDING") {
    throw new Error("この申請はすでに確認済みです。");
  }
  await prisma.stampClaim.update({
    where: { id: claimId },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
      reviewComment: reviewComment || null,
    },
  });
}

export type StampDisplayStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/** タレント×各スタンプ項目の表示用ステータスを、最新の申請履歴から計算する */
export function computeStampStatuses(
  items: { id: string }[],
  claims: { stampItemId: string; status: string; submittedAt: Date }[]
): Map<string, StampDisplayStatus> {
  const latestByItem = new Map<string, { status: string; submittedAt: Date }>();
  for (const c of claims) {
    const existing = latestByItem.get(c.stampItemId);
    if (!existing || c.submittedAt > existing.submittedAt) {
      latestByItem.set(c.stampItemId, c);
    }
  }
  const result = new Map<string, StampDisplayStatus>();
  for (const item of items) {
    const latest = latestByItem.get(item.id);
    result.set(item.id, (latest?.status as StampDisplayStatus) ?? "NONE");
  }
  return result;
}
