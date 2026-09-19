"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TalentFormData } from "@/lib/talent-types";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new Error("ログインが必要です");
  }
  return session;
}

function toTalentData(data: TalentFormData) {
  const age = data.age.trim() ? Number.parseInt(data.age, 10) : null;
  return {
    lastName: data.lastName.trim(),
    firstName: data.firstName.trim(),
    lastNameKana: data.lastNameKana.trim() || null,
    firstNameKana: data.firstNameKana.trim() || null,
    gender: data.gender.trim() || null,
    age: age != null && !Number.isNaN(age) && age > 0 ? age : null,
    companyId: data.companyId,
    postalCode: data.postalCode.trim() || null,
    prefecture: data.prefecture.trim() || null,
    city: data.city.trim() || null,
    addressLine: data.addressLine.trim() || null,
    status: data.status.trim() || "ACTIVE",
    needsReview: data.needsReview,
  };
}

function toBankAccountData(data: TalentFormData) {
  return {
    bankName: data.bankName.trim() || null,
    branchName: data.branchName.trim() || null,
    accountType: data.accountType.trim() || null,
    accountNumber: data.accountNumber.trim() || null,
    accountHolder: data.accountHolder.trim() || null,
  };
}

export async function createTalent(data: TalentFormData) {
  await requireAdmin();

  const talent = await prisma.$transaction(async (tx) => {
    const { _max } = await tx.talent.aggregate({ _max: { talentNo: true } });
    const talentNo = (_max.talentNo ?? 0) + 1;

    const created = await tx.talent.create({
      data: {
        ...toTalentData(data),
        talentNo,
        bankAccount: { create: toBankAccountData(data) },
      },
    });

    const months = await tx.paymentMonth.findMany({ select: { id: true } });
    if (months.length > 0) {
      await tx.paymentRecord.createMany({
        data: months.map((m) => ({ talentId: created.id, paymentMonthId: m.id })),
      });
    }

    return created;
  });

  revalidatePath("/talents");
  redirect(`/talents/${talent.id}`);
}

export async function updateTalent(talentId: string, data: TalentFormData) {
  await requireAdmin();

  await prisma.talent.update({
    where: { id: talentId },
    data: {
      ...toTalentData(data),
      bankAccount: {
        upsert: {
          create: toBankAccountData(data),
          update: toBankAccountData(data),
        },
      },
    },
  });

  revalidatePath("/talents");
  revalidatePath(`/talents/${talentId}`);
  redirect(`/talents/${talentId}`);
}

export async function deleteTalent(talentId: string) {
  await requireAdmin();

  await prisma.talent.delete({ where: { id: talentId } });

  revalidatePath("/talents");
  redirect("/talents");
}
