import type {
  Achievement,
  DesiredWork,
  Hobby,
  Profile,
  Skill,
  SocialAccount,
  User,
} from "@prisma/client";

export type MatchableUser = User & {
  profile: Profile | null;
  achievements: Achievement[];
  hobbies: Hobby[];
  skills: Skill[];
  desiredWorks: DesiredWork[];
  socialAccounts: SocialAccount[];
  adminNote: { content: string } | null;
};

export type MatchableProject = {
  name: string;
  description: string;
  genre: string;
  desiredActivities: string; // comma separated
  idealPersona?: string | null;
  requiredConditions?: string | null;
  otherConditions?: string | null;
};

export interface MatchResult {
  userId: string;
  score: number;
  reasons: string[];
  summary: string;
}

const DELIMS = /[、,,・\/\n\r・／　\s]+/;

function splitClauses(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[、,,\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

/** 双方向の部分一致で「関連している」とみなす簡易マッチャー（日本語は分かち書きしない） */
function relates(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na.length < 2 || nb.length < 2) return na === nb;
  return na.includes(nb) || nb.includes(na);
}

function anyRelates(text: string, items: string[]): string[] {
  return items.filter((item) => relates(text, item));
}

export function buildUserCorpus(user: MatchableUser) {
  const hobbies = user.hobbies.map((h) => h.name);
  const skills = user.skills.map((s) => s.name);
  const desiredWorks = user.desiredWorks.map((d) => d.name + (d.note ? ` ${d.note}` : ""));
  const achievements = user.achievements.map(
    (a) => `${a.content} ${a.category ?? ""}`.trim()
  );
  const activePlatforms = user.socialAccounts
    .filter((s) => (s.url && s.url.trim().length > 0) || (s.followers ?? 0) > 0)
    .map((s) => (s.platform === "OTHER" ? s.label ?? "その他SNS" : platformLabel(s.platform)));

  return {
    hobbies,
    skills,
    desiredWorks,
    achievements,
    activePlatforms,
    finalDream: user.profile?.finalDream ?? "",
    halfYearGoal: user.profile?.halfYearGoal ?? "",
  };
}

function platformLabel(platform: string): string {
  switch (platform) {
    case "YOUTUBE":
      return "YouTube";
    case "X":
      return "X";
    case "TIKTOK":
      return "TikTok";
    case "INSTAGRAM":
      return "Instagram";
    case "REALITY":
      return "REALITY";
    default:
      return platform;
  }
}

function followerScore(user: MatchableUser, activities: string[]): number {
  const relevant = user.socialAccounts.filter((s) => {
    const label = s.platform === "OTHER" ? s.label ?? "" : platformLabel(s.platform);
    return activities.length === 0 || activities.some((act) => relates(act, label));
  });
  const max = relevant.reduce((m, s) => Math.max(m, s.followers ?? 0), 0);
  const overall = user.socialAccounts.reduce((m, s) => Math.max(m, s.followers ?? 0), 0);
  const best = Math.max(max, overall * 0.3); // 案件と直接関係ない場合も規模は多少加味する
  if (best >= 100000) return 5;
  if (best >= 30000) return 4;
  if (best >= 10000) return 3;
  if (best >= 1000) return 2;
  if (best > 0) return 1;
  return 0;
}

/**
 * ルールベースのスコアリングエンジン。
 * 外部LLM APIに依存せず、案件の必須条件・本人希望・実績・趣味・特技・
 * 活動ジャンル・SNS規模・目標/夢との親和性を重み付けして 0-100 点で評価する。
 * 将来的に外部AIの推薦スコアへ差し替え／併用しやすいよう、入出力を単純な
 * データ構造に保っている。
 */
export function scoreCandidate(project: MatchableProject, user: MatchableUser): MatchResult {
  const corpus = buildUserCorpus(user);
  const activities = project.desiredActivities.split(",").map((a) => a.trim()).filter(Boolean);
  const reasons: string[] = [];
  let score = 0;

  // 1. 必須条件 (最重要, 25点)
  const requiredClauses = splitClauses(project.requiredConditions);
  if (requiredClauses.length === 0) {
    score += 25;
  } else {
    const allUserText = [
      ...corpus.hobbies,
      ...corpus.skills,
      ...corpus.desiredWorks,
      ...corpus.achievements,
      corpus.finalDream,
      corpus.halfYearGoal,
    ];
    let matchedClauses = 0;
    for (const clause of requiredClauses) {
      const hit = anyRelates(clause, allUserText);
      if (hit.length > 0) {
        matchedClauses += 1;
        reasons.push(`必須条件「${clause}」に合致（${hit[0]}）`);
      }
    }
    score += Math.round((matchedClauses / requiredClauses.length) * 25);
    if (matchedClauses === 0) {
      reasons.push(`必須条件「${requiredClauses.join("・")}」との明確な合致は確認できませんでした`);
    }
  }

  // 2. 本人の希望案件との一致 (20点) - 最重要評価項目
  const desiredHit = anyRelates(project.genre, corpus.desiredWorks).concat(
    corpus.desiredWorks.filter((d) => activities.some((act) => relates(act, d)))
  );
  const desiredDescHit = anyRelates(project.description, corpus.desiredWorks);
  if (desiredHit.length > 0 || desiredDescHit.length > 0) {
    score += 20;
    reasons.push("本人がこの案件のジャンル・活動を希望している");
  } else if (corpus.desiredWorks.length > 0) {
    score += 4;
  }

  // 3. 実績との一致 (15点)
  const achievementHits = corpus.achievements.filter(
    (a) => relates(project.genre, a) || relates(project.description, a)
  );
  if (achievementHits.length > 0) {
    score += Math.min(achievementHits.length, 3) * 5;
    reasons.push(`過去の実績（${achievementHits[0]}）が案件内容と関連している`);
  }

  // 4. 趣味との一致 (10点)
  const hobbyHits = corpus.hobbies.filter(
    (h) => relates(project.genre, h) || relates(project.description, h) || (project.idealPersona ? relates(project.idealPersona, h) : false)
  );
  if (hobbyHits.length > 0) {
    score += Math.min(hobbyHits.length, 2) * 5;
    reasons.push(`趣味が「${hobbyHits.join("」「")}」で案件内容と親和性が高い`);
  }

  // 5. 特技との一致 (10点)
  const skillHits = corpus.skills.filter(
    (s) => relates(project.genre, s) || relates(project.description, s) || (project.idealPersona ? relates(project.idealPersona, s) : false)
  );
  if (skillHits.length > 0) {
    score += Math.min(skillHits.length, 2) * 5;
    reasons.push(`特技が「${skillHits.join("」「")}」で案件が求めるスキルと一致`);
  }

  // 6. 活動ジャンル(SNS利用状況)との一致 (10点)
  const platformHits = activities.filter((act) => corpus.activePlatforms.some((p) => relates(act, p)));
  if (platformHits.length > 0) {
    score += Math.min(platformHits.length, 2) * 5;
    reasons.push(`${platformHits.join("・")}で活動しており、希望する活動形態と一致`);
  }

  // 7. SNS規模 (5点)
  const fScore = followerScore(user, activities);
  score += fScore;
  if (fScore >= 3) {
    reasons.push("SNSのフォロワー規模が大きく、案件の訴求力が期待できる");
  }

  // 8. 半年後の目標との相性 (3点)
  if (corpus.halfYearGoal && (relates(project.genre, corpus.halfYearGoal) || relates(project.description, corpus.halfYearGoal))) {
    score += 3;
    reasons.push("半年後の目標と案件内容の相性が良い");
  }

  // 9. 最終的な夢との相性 (2点)
  if (corpus.finalDream && (relates(project.genre, corpus.finalDream) || relates(project.description, corpus.finalDream))) {
    score += 2;
    reasons.push("将来の夢と案件の方向性が合致している");
  }

  score = Math.max(0, Math.min(100, score));

  if (reasons.length === 0) {
    reasons.push("明確な合致ポイントは少ないですが、登録情報全体から一定の親和性があると判断しました");
  }

  const summary = buildSummary(user, reasons);

  return { userId: user.id, score, reasons, summary };
}

function buildSummary(user: MatchableUser, reasons: string[]): string {
  const name = user.stageName ?? "この方";
  const body = reasons
    .slice(0, 4)
    .map((r, i) => (i === 0 ? r : `また、${r}`))
    .join("。");
  return `${name}は、${body}。以上の点から、本案件との親和性が高いと判断しました。`;
}

export function rankCandidates(
  project: MatchableProject,
  users: MatchableUser[]
): MatchResult[] {
  return users
    .map((u) => scoreCandidate(project, u))
    .sort((a, b) => b.score - a.score);
}
