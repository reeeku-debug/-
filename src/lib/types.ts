export interface AchievementInput {
  content: string;
  category: string;
  yearMonth: string;
}

export interface SocialInput {
  platform: "YOUTUBE" | "X" | "TIKTOK" | "INSTAGRAM" | "REALITY" | "OTHER";
  url: string;
  followers: string; // 文字列で保持し、保存時に数値化
  label: string; // OTHER選択時のSNS名
}

export interface TalentFormData {
  realName: string;
  stageName: string;
  achievements: AchievementInput[];
  hobbies: string[];
  skills: string[];
  finalDream: string;
  halfYearGoal: string;
  desiredWorks: string[];
  desiredWorksOtherNote: string;
  social: SocialInput[];
}

export const SOCIAL_PLATFORM_ORDER: SocialInput["platform"][] = [
  "YOUTUBE",
  "X",
  "TIKTOK",
  "INSTAGRAM",
  "REALITY",
  "OTHER",
];

export function emptyTalentFormData(): TalentFormData {
  return {
    realName: "",
    stageName: "",
    achievements: [{ content: "", category: "", yearMonth: "" }],
    hobbies: [],
    skills: [],
    finalDream: "",
    halfYearGoal: "",
    desiredWorks: [],
    desiredWorksOtherNote: "",
    social: SOCIAL_PLATFORM_ORDER.map((platform) => ({
      platform,
      url: "",
      followers: "",
      label: "",
    })),
  };
}
