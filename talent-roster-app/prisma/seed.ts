import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, name: "管理者" },
  });
  console.log(`管理者アカウント: ${adminEmail} / ${adminPassword}`);

  const companies = ["アソビネクスト", "ANNIN"];
  for (const name of companies) {
    await prisma.company.upsert({ where: { name }, update: {}, create: { name } });
  }

  const paymentMonths: { yearMonth: string; label: string; sortOrder: number }[] = [];
  let sortOrder = 0;
  for (const year of [2025, 2026]) {
    for (let month = 1; month <= 12; month++) {
      sortOrder += 1;
      const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
      paymentMonths.push({ yearMonth, label: `${year}年${month}月`, sortOrder });
    }
  }
  for (const pm of paymentMonths) {
    await prisma.paymentMonth.upsert({
      where: { yearMonth: pm.yearMonth },
      update: { label: pm.label, sortOrder: pm.sortOrder },
      create: pm,
    });
  }
  console.log(
    `所属事務所: ${companies.join(", ")} / 入金月: ${paymentMonths[0].yearMonth}〜${paymentMonths[paymentMonths.length - 1].yearMonth}`
  );

  console.log("シードデータの投入が完了しました。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
