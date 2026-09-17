import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface TalentRosterSearchParams {
  q?: string;
  companyId?: string;
  gender?: string;
  status?: string;
  paymentStatus?: string;
  registeredMonth?: string; // "YYYY-MM"
}

const ROSTER_INCLUDE = {
  company: true,
  bankAccount: true,
  paymentRecords: { include: { paymentMonth: true } },
} satisfies Prisma.TalentInclude;

export type TalentRosterWithRelations = Prisma.TalentGetPayload<{ include: typeof ROSTER_INCLUDE }>;

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatTalentNo(talentNo: number): string {
  return String(talentNo).padStart(3, "0");
}

export function currentMonthPaymentRecord(
  talent: Pick<TalentRosterWithRelations, "paymentRecords">
) {
  const yearMonth = currentYearMonth();
  return talent.paymentRecords.find((r) => r.paymentMonth.yearMonth === yearMonth) ?? null;
}

export async function searchTalentRoster(
  params: TalentRosterSearchParams
): Promise<TalentRosterWithRelations[]> {
  const conditions: Prisma.TalentWhereInput[] = [];

  const q = params.q?.trim();
  if (q) {
    const talentNoQuery = Number.parseInt(q, 10);
    conditions.push({
      OR: [
        { lastName: { contains: q } },
        { firstName: { contains: q } },
        { lastNameKana: { contains: q } },
        { firstNameKana: { contains: q } },
        { company: { is: { name: { contains: q } } } },
        ...(Number.isInteger(talentNoQuery) ? [{ talentNo: talentNoQuery }] : []),
      ],
    });
  }

  if (params.companyId?.trim()) {
    conditions.push({ companyId: params.companyId.trim() });
  }
  if (params.gender?.trim()) {
    conditions.push({ gender: params.gender.trim() });
  }
  if (params.status?.trim()) {
    conditions.push({ status: params.status.trim() });
  }
  if (params.registeredMonth?.trim()) {
    const [year, month] = params.registeredMonth.trim().split("-").map(Number);
    if (year && month) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 1));
      conditions.push({ registeredAt: { gte: start, lt: end } });
    }
  }
  if (params.paymentStatus?.trim()) {
    conditions.push({
      paymentRecords: {
        some: {
          status: params.paymentStatus.trim(),
          paymentMonth: { is: { yearMonth: currentYearMonth() } },
        },
      },
    });
  }

  return prisma.talent.findMany({
    where: { AND: conditions },
    include: ROSTER_INCLUDE,
    orderBy: { talentNo: "asc" },
  });
}
