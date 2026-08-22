import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function upsertUser(opts: {
  email: string;
  password: string;
  role: "ADMIN" | "RESPONDENT";
  realName?: string;
  stageName?: string;
}) {
  const passwordHash = await bcrypt.hash(opts.password, 10);
  return prisma.user.upsert({
    where: { email: opts.email },
    update: {},
    create: {
      email: opts.email,
      passwordHash,
      role: opts.role,
      realName: opts.realName,
      stageName: opts.stageName,
    },
  });
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  await upsertUser({
    email: adminEmail,
    password: adminPassword,
    role: "ADMIN",
    stageName: "管理者",
  });
  console.log(`管理者アカウント: ${adminEmail} / ${adminPassword}`);

  const sampleTalents = [
    {
      email: "mirune@example.com",
      password: "password123",
      realName: "山田 美琴",
      stageName: "大内りくう",
      gender: "女性",
      age: 22,
      residenceArea: "東京都",
      finalDream: "大きなライブ会場でワンマンライブをしたい",
      halfYearGoal: "配信イベントで1位になる",
      achievements: [
        { content: "配信イベント○○ 2位", category: "配信イベント" },
        { content: "ゲームイベント出演", category: "イベント出演" },
        { content: "YouTube登録者2万人達成", category: "YouTube" },
      ],
      hobbies: ["ゲーム", "アニメ", "音楽"],
      skills: ["歌", "ゲーム", "MC"],
      desiredWorks: [{ name: "ゲーム案件" }, { name: "YouTube案件" }, { name: "歌唱" }],
      social: [
        { platform: "YOUTUBE", url: "https://youtube.com/@mirune", followers: 21000 },
        { platform: "X", url: "https://x.com/mirune", followers: 15000 },
        { platform: "TIKTOK", url: "https://tiktok.com/@mirune", followers: 8000 },
      ],
      adminNote: "ゲーム案件との相性が良い。企業案件経験あり。",
    },
    {
      email: "hana@example.com",
      password: "password123",
      realName: "佐藤 花",
      stageName: "花音レイ",
      gender: "女性",
      age: 25,
      residenceArea: "大阪府",
      finalDream: "有名な声優になりたい",
      halfYearGoal: "案件を5件獲得する",
      achievements: [
        { content: "アニメ関連イベントMC担当", category: "MC" },
        { content: "企業案件（美容系）出演", category: "企業案件" },
      ],
      hobbies: ["アニメ", "コスプレ", "カフェ巡り"],
      skills: ["声真似", "ナレーション", "MC"],
      desiredWorks: [{ name: "声優" }, { name: "アニメ案件" }, { name: "美容案件" }],
      social: [
        { platform: "INSTAGRAM", url: "https://instagram.com/hanane", followers: 32000 },
        { platform: "X", url: "https://x.com/hanane", followers: 9000 },
      ],
      adminNote: "声優・ナレーション案件を優先したい。",
    },
    {
      email: "taku@example.com",
      password: "password123",
      realName: "鈴木 拓真",
      stageName: "タクマ",
      gender: "男性",
      age: 20,
      residenceArea: "愛知県",
      finalDream: "YouTube登録者10万人を達成したい",
      halfYearGoal: "YouTube登録者1万人",
      achievements: [
        { content: "TikTokフォロワー5万人達成", category: "TikTok" },
        { content: "ゲーム配信イベント出演", category: "配信イベント" },
      ],
      hobbies: ["ゲーム", "スポーツ"],
      skills: ["ゲーム", "動画編集"],
      desiredWorks: [{ name: "ゲーム案件" }, { name: "TikTok案件" }],
      social: [
        { platform: "TIKTOK", url: "https://tiktok.com/@taku", followers: 51000 },
        { platform: "YOUTUBE", url: "https://youtube.com/@taku", followers: 7000 },
      ],
      adminNote: "大型案件はスケジュール確認が必要。",
    },
    {
      email: "yui@example.com",
      password: "password123",
      realName: "高橋 唯",
      stageName: "ゆいっぺ",
      gender: "女性",
      age: 19,
      residenceArea: "福岡県",
      finalDream: "ファッション誌モデルとして活躍したい",
      halfYearGoal: "美容案件を3件獲得する",
      achievements: [{ content: "ファッションイベント出演", category: "イベント出演" }],
      hobbies: ["旅行", "カフェ巡り"],
      skills: ["ダンス", "イラスト"],
      desiredWorks: [{ name: "ファッション案件" }, { name: "美容案件" }, { name: "旅行案件" }],
      social: [{ platform: "INSTAGRAM", url: "https://instagram.com/yuippe", followers: 18000 }],
      adminNote: "",
    },
  ];

  for (const t of sampleTalents) {
    const user = await upsertUser({
      email: t.email,
      password: t.password,
      role: "RESPONDENT",
      realName: t.realName,
      stageName: t.stageName,
    });

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        gender: t.gender,
        age: t.age,
        residenceArea: t.residenceArea,
        finalDream: t.finalDream,
        halfYearGoal: t.halfYearGoal,
        isDraft: false,
        submittedAt: new Date(),
      },
    });

    const existingAch = await prisma.achievement.count({ where: { userId: user.id } });
    if (existingAch === 0) {
      await prisma.achievement.createMany({
        data: t.achievements.map((a) => ({ userId: user.id, content: a.content, category: a.category })),
      });
    }

    const existingHobby = await prisma.hobby.count({ where: { userId: user.id } });
    if (existingHobby === 0) {
      await prisma.hobby.createMany({ data: t.hobbies.map((name) => ({ userId: user.id, name })) });
    }

    const existingSkill = await prisma.skill.count({ where: { userId: user.id } });
    if (existingSkill === 0) {
      await prisma.skill.createMany({ data: t.skills.map((name) => ({ userId: user.id, name })) });
    }

    const existingDesired = await prisma.desiredWork.count({ where: { userId: user.id } });
    if (existingDesired === 0) {
      await prisma.desiredWork.createMany({
        data: t.desiredWorks.map((d) => ({ userId: user.id, name: d.name })),
      });
    }

    const existingSocial = await prisma.socialAccount.count({ where: { userId: user.id } });
    if (existingSocial === 0) {
      await prisma.socialAccount.createMany({
        data: t.social.map((s) => ({
          userId: user.id,
          platform: s.platform,
          url: s.url,
          followers: s.followers,
        })),
      });
    }

    await prisma.adminNote.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, content: t.adminNote },
    });
  }

  const existingProject = await prisma.project.findFirst({ where: { name: "新作スマホゲームPR案件" } });
  if (!existingProject) {
    await prisma.project.create({
      data: {
        name: "新作スマホゲームPR案件",
        description: "新作スマートフォンゲームをプレイして、YouTubeで紹介してもらう案件",
        genre: "ゲーム",
        desiredActivities: "YouTube,TikTok",
        idealPersona: "ゲームが好きで、明るく商品を紹介できる人",
        requiredConditions: "ゲーム配信経験",
        otherConditions: "過去にゲーム案件経験があると望ましい",
        status: "RECRUITING",
      },
    });
  }

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
