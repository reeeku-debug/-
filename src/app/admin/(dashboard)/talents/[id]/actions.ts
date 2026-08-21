"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TalentFormData } from "@/lib/types";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("管理者権限が必要です");
  }
  return session;
}

export async function updateAdminNote(userId: string, content: string) {
  await requireAdmin();

  await prisma.adminNote.upsert({
    where: { userId },
    update: { content },
    create: { userId, content },
  });

  revalidatePath(`/admin/talents/${userId}`);
}

export async function adminUpdateTalent(userId: string, data: TalentFormData) {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: {
      realName: data.realName.trim() || null,
      stageName: data.stageName.trim() || null,
    },
  });

  await prisma.profile.upsert({
    where: { userId },
    update: {
      finalDream: data.finalDream.trim() || null,
      halfYearGoal: data.halfYearGoal.trim() || null,
    },
    create: {
      userId,
      finalDream: data.finalDream.trim() || null,
      halfYearGoal: data.halfYearGoal.trim() || null,
      isDraft: false,
      submittedAt: new Date(),
    },
  });

  await prisma.achievement.deleteMany({ where: { userId } });
  const achievements = data.achievements.filter((a) => a.content.trim().length > 0);
  if (achievements.length > 0) {
    await prisma.achievement.createMany({
      data: achievements.map((a) => ({
        userId,
        content: a.content.trim(),
        category: a.category.trim() || null,
        yearMonth: a.yearMonth.trim() || null,
      })),
    });
  }

  await prisma.hobby.deleteMany({ where: { userId } });
  const hobbies = data.hobbies.map((h) => h.trim()).filter(Boolean);
  if (hobbies.length > 0) {
    await prisma.hobby.createMany({ data: hobbies.map((name) => ({ userId, name })) });
  }

  await prisma.skill.deleteMany({ where: { userId } });
  const skills = data.skills.map((s) => s.trim()).filter(Boolean);
  if (skills.length > 0) {
    await prisma.skill.createMany({ data: skills.map((name) => ({ userId, name })) });
  }

  await prisma.desiredWork.deleteMany({ where: { userId } });
  const desiredWorks = data.desiredWorks.map((d) => d.trim()).filter(Boolean);
  if (desiredWorks.length > 0) {
    await prisma.desiredWork.createMany({
      data: desiredWorks.map((name) => ({
        userId,
        name,
        note: name === "その他" ? data.desiredWorksOtherNote.trim() || null : null,
      })),
    });
  }

  await prisma.socialAccount.deleteMany({ where: { userId } });
  const social = data.social.filter((s) => s.url.trim() || s.followers.trim());
  if (social.length > 0) {
    await prisma.socialAccount.createMany({
      data: social.map((s) => ({
        userId,
        platform: s.platform,
        url: s.url.trim() || null,
        followers: s.followers.trim() ? Number.parseInt(s.followers, 10) || 0 : null,
        label: s.platform === "OTHER" ? s.label.trim() || null : null,
      })),
    });
  }

  revalidatePath(`/admin/talents/${userId}`);
  revalidatePath("/admin/talents");
}
