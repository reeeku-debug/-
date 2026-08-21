import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface TalentSearchParams {
  q?: string;
  hobby?: string;
  skill?: string;
  achievement?: string;
  desiredWork?: string;
  snsPlatform?: string;
  minFollowers?: number;
  halfYearGoal?: string;
  finalDream?: string;
}

const TALENT_INCLUDE = {
  profile: true,
  achievements: true,
  hobbies: true,
  skills: true,
  desiredWorks: true,
  socialAccounts: true,
  adminNote: true,
} satisfies Prisma.UserInclude;

export type TalentWithRelations = Prisma.UserGetPayload<{ include: typeof TALENT_INCLUDE }>;

export async function searchTalents(params: TalentSearchParams): Promise<TalentWithRelations[]> {
  const conditions: Prisma.UserWhereInput[] = [];

  const q = params.q?.trim();
  if (q) {
    conditions.push({
      OR: [
        { stageName: { contains: q } },
        { hobbies: { some: { name: { contains: q } } } },
        { skills: { some: { name: { contains: q } } } },
        { achievements: { some: { content: { contains: q } } } },
        { desiredWorks: { some: { name: { contains: q } } } },
        { profile: { is: { finalDream: { contains: q } } } },
        { profile: { is: { halfYearGoal: { contains: q } } } },
      ],
    });
  }

  if (params.hobby?.trim()) {
    conditions.push({ hobbies: { some: { name: { contains: params.hobby.trim() } } } });
  }
  if (params.skill?.trim()) {
    conditions.push({ skills: { some: { name: { contains: params.skill.trim() } } } });
  }
  if (params.achievement?.trim()) {
    conditions.push({ achievements: { some: { content: { contains: params.achievement.trim() } } } });
  }
  if (params.desiredWork?.trim()) {
    conditions.push({ desiredWorks: { some: { name: { contains: params.desiredWork.trim() } } } });
  }
  if (params.snsPlatform?.trim()) {
    conditions.push({ socialAccounts: { some: { platform: params.snsPlatform.trim() } } });
  }
  if (params.minFollowers && params.minFollowers > 0) {
    conditions.push({ socialAccounts: { some: { followers: { gte: params.minFollowers } } } });
  }
  if (params.halfYearGoal?.trim()) {
    conditions.push({ profile: { is: { halfYearGoal: { contains: params.halfYearGoal.trim() } } } });
  }
  if (params.finalDream?.trim()) {
    conditions.push({ profile: { is: { finalDream: { contains: params.finalDream.trim() } } } });
  }

  return prisma.user.findMany({
    where: {
      role: "RESPONDENT",
      AND: conditions,
    },
    include: TALENT_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}
