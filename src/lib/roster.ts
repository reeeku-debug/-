import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface TalentRosterSearchParams {
  q?: string;
  companyId?: string;
  gender?: string;
  status?: string;
  paymentStatus?: string;
  registeredMonth?: string; // "YYYY-MM"
  needsReview?: string; // "1" のとき要確認のみ
  page?: string;
}

export const ROSTER_PAGE_SIZE = 50;

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function rosterInclude(yearMonth: string) {
  return {
    company: true,
    bankAccount: true,
    // 一覧では当月分の入金レコードだけ取得する（全月取得は大量データ時に非効率なため）
    paymentRecords: {
      where: { paymentMonth: { is: { yearMonth } } },
      include: { paymentMonth: true },
    },
  } satisfies Prisma.TalentInclude;
}

export type TalentRosterWithRelations = Prisma.TalentGetPayload<{
  include: ReturnType<typeof rosterInclude>;
}>;

export function formatTalentNo(talentNo: number): string {
  return String(talentNo).padStart(3, "0");
}

export function currentMonthPaymentRecord(
  talent: Pick<TalentRosterWithRelations, "paymentRecords">
) {
  const yearMonth = currentYearMonth();
  return talent.paymentRecords.find((r) => r.paymentMonth.yearMonth === yearMonth) ?? null;
}

export interface TalentRosterSearchResult {
  talents: TalentRosterWithRelations[];
  total: number;
  page: number;
  totalPages: number;
}

export async function searchTalentRoster(
  params: TalentRosterSearchParams
): Promise<TalentRosterSearchResult> {
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
  if (params.needsReview?.trim()) {
    conditions.push({ needsReview: true });
  }

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where: Prisma.TalentWhereInput = { AND: conditions };
  const yearMonth = currentYearMonth();

  const [talents, total] = await Promise.all([
    prisma.talent.findMany({
      where,
      include: rosterInclude(yearMonth),
      orderBy: { talentNo: "asc" },
      skip: (page - 1) * ROSTER_PAGE_SIZE,
      take: ROSTER_PAGE_SIZE,
    }),
    prisma.talent.count({ where }),
  ]);

  return { talents, total, page, totalPages: Math.max(1, Math.ceil(total / ROSTER_PAGE_SIZE)) };
}
