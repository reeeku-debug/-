"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TalentFormData } from "@/lib/types";

export async function saveTalentProfile(data: TalentFormData, opts: { submit: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESPONDENT") {
    throw new Error("ログインが必要です");
  }
  const userId = session.user.id;

  await prisma.user.update({
    where: { id: userId },
    data: {
      realName: data.realName.trim() || null,
      stageName: data.stageName.trim() || null,
    },
  });

  const age = data.age.trim() ? Number.parseInt(data.age, 10) : null;

  await prisma.profile.upsert({
    where: { userId },
    update: {
      gender: data.gender.trim() || null,
      age: age && !Number.isNaN(age) ? age : null,
      residenceArea: data.residenceArea.trim() || null,
      finalDream: data.finalDream.trim() || null,
      halfYearGoal: data.halfYearGoal.trim() || null,
      isDraft: !opts.submit,
      ...(opts.submit ? { submittedAt: new Date() } : {}),
    },
    create: {
      userId,
      gender: data.gender.trim() || null,
      age: age && !Number.isNaN(age) ? age : null,
      residenceArea: data.residenceArea.trim() || null,
      finalDream: data.finalDream.trim() || null,
      halfYearGoal: data.halfYearGoal.trim() || null,
      isDraft: !opts.submit,
      submittedAt: opts.submit ? new Date() : null,
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

  revalidatePath("/mypage");
  revalidatePath("/form");
  revalidatePath("/admin/talents");

  return { ok: true };
}
