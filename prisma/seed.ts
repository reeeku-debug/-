import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_STEPS } from "../src/lib/constants";
import { initializeTalentSteps, submitReport, approveReport, adminForceClear } from "../src/lib/progress";

const prisma = new PrismaClient();

async function main() {
  // --- マネージャーアカウント ---
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: "マネージャー",
    },
  });
  console.log(`✔ マネージャーアカウント: ${adminEmail} / ${adminPassword}`);

  // --- STEPマスタ（既存があればスキップ） ---
  const existingStepCount = await prisma.stepTemplate.count();
  if (existingStepCount === 0) {
    for (const s of DEFAULT_STEPS) {
      await prisma.stepTemplate.create({
        data: {
          order: s.order,
          key: s.key,
          icon: s.icon,
          title: s.title,
          description: s.description,
          type: "type" in s ? s.type : "NORMAL",
          requiresReport: "requiresReport" in s ? s.requiresReport : true,
        },
      });
    }
    console.log(`✔ STEPマスタ ${DEFAULT_STEPS.length}件を登録しました`);
  } else {
    console.log("• STEPマスタは既に存在するためスキップしました");
  }

  // --- サンプルタレント ---
  async function upsertTalent(input: {
    loginId: string;
    name: string;
    activityName: string;
    slug: string;
  }) {
    const existing = await prisma.talent.findUnique({ where: { loginId: input.loginId } });
    if (existing) return existing;

    const talent = await prisma.talent.create({
      data: {
        loginId: input.loginId,
        passwordHash: await bcrypt.hash("password123", 10),
        slug: input.slug,
        name: input.name,
        activityName: input.activityName,
      },
    });
    await initializeTalentSteps(talent.id);
    return talent;
  }

  // Aさん: これから挑戦開始
  const talentA = await upsertTalent({
    loginId: "hoshino",
    name: "星野みら",
    activityName: "",
    slug: "hoshino-mira",
  });

  // Bさん: STEP1〜3承認済み、STEP4は確認待ち
  const talentB = await upsertTalent({
    loginId: "kirakira",
    name: "きらら",
    activityName: "きららチャンネル",
    slug: "kirakira-vtuber",
  });
  const stepsAsc = await prisma.stepTemplate.findMany({ where: { type: "NORMAL" }, orderBy: { order: "asc" } });
  if (stepsAsc.length >= 4) {
    for (const step of stepsAsc.slice(0, 3)) {
      const current = await prisma.talentStepStatus.findUnique({
        where: { talentId_stepTemplateId: { talentId: talentB.id, stepTemplateId: step.id } },
      });
      if (current?.status === "CHALLENGE") {
        await submitReport(talentB.id, step.id, { comment: "完了しました！" });
        const report = await prisma.stepReport.findFirst({
          where: { talentId: talentB.id, stepTemplateId: step.id, status: "PENDING" },
          orderBy: { submittedAt: "desc" },
        });
        if (report) await approveReport(report.id, admin.id);
      }
    }
    const fourth = stepsAsc[3];
    const fourthStatus = await prisma.talentStepStatus.findUnique({
      where: { talentId_stepTemplateId: { talentId: talentB.id, stepTemplateId: fourth.id } },
    });
    if (fourthStatus?.status === "CHALLENGE") {
      await submitReport(talentB.id, fourth.id, {
        comment: "Xアカウントを作成しました！",
        relatedUrl: "https://x.com/example",
      });
    }
  }

  // Cさん: GOALまで到達済み
  const talentC = await upsertTalent({
    loginId: "sorane",
    name: "そらね",
    activityName: "そらねチャンネル",
    slug: "sorane-vtuber",
  });
  const allNormalSteps = await prisma.stepTemplate.findMany({
    where: { type: "NORMAL" },
    orderBy: { order: "asc" },
  });
  for (const step of allNormalSteps) {
    const current = await prisma.talentStepStatus.findUnique({
      where: { talentId_stepTemplateId: { talentId: talentC.id, stepTemplateId: step.id } },
    });
    if (current && current.status !== "CLEAR") {
      await adminForceClear(talentC.id, step.id);
    }
  }

  console.log("✔ サンプルタレント3名（hoshino / kirakira / sorane、パスワードは全員 password123）を登録しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
