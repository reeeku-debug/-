"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rankCandidates, type MatchableProject } from "@/lib/matching";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("管理者権限が必要です");
  }
  return session;
}

export async function runMatching(projectId: string) {
  await requireAdmin();

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const users = await prisma.user.findMany({
    where: { role: "RESPONDENT" },
    include: {
      profile: true,
      achievements: true,
      hobbies: true,
      skills: true,
      desiredWorks: true,
      socialAccounts: true,
      adminNote: true,
    },
  });

  const matchableProject: MatchableProject = {
    name: project.name,
    description: project.description,
    genre: project.genre,
    desiredActivities: project.desiredActivities,
    idealPersona: project.idealPersona,
    requiredConditions: project.requiredConditions,
    otherConditions: project.otherConditions,
  };

  const results = rankCandidates(matchableProject, users);

  await prisma.$transaction(
    results.map((r) =>
      prisma.projectCandidate.upsert({
        where: { projectId_userId: { projectId, userId: r.userId } },
        update: { matchScore: r.score, reasons: JSON.stringify(r.reasons) },
        create: {
          projectId,
          userId: r.userId,
          matchScore: r.score,
          reasons: JSON.stringify(r.reasons),
          status: "SUGGESTED",
        },
      })
    )
  );

  revalidatePath(`/admin/projects/${projectId}`);
}

export async function setCandidateStatus(candidateId: string, status: string) {
  await requireAdmin();

  const candidate = await prisma.projectCandidate.update({
    where: { id: candidateId },
    data: { status },
  });

  revalidatePath(`/admin/projects/${candidate.projectId}`);
}

export async function setCandidateNote(candidateId: string, note: string) {
  await requireAdmin();

  const candidate = await prisma.projectCandidate.update({
    where: { id: candidateId },
    data: { adminNote: note },
  });

  revalidatePath(`/admin/projects/${candidate.projectId}`);
}
