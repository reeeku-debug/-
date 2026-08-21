import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SOCIAL_PLATFORM_ORDER, type TalentFormData } from "@/lib/types";
import TalentEditForm from "@/components/admin/talent-edit-form";

export default async function TalentEditPage({ params }: { params: { id: string } }) {
  const talent = await prisma.user.findUnique({
    where: { id: params.id, role: "RESPONDENT" },
    include: {
      profile: true,
      achievements: true,
      hobbies: true,
      skills: true,
      desiredWorks: true,
      socialAccounts: true,
    },
  });
  if (!talent) notFound();

  const otherDesiredWork = talent.desiredWorks.find((d) => d.name === "その他");

  const initialData: TalentFormData = {
    realName: talent.realName ?? "",
    stageName: talent.stageName ?? "",
    achievements:
      talent.achievements.length > 0
        ? talent.achievements.map((a) => ({
            content: a.content,
            category: a.category ?? "",
            yearMonth: a.yearMonth ?? "",
          }))
        : [{ content: "", category: "", yearMonth: "" }],
    hobbies: talent.hobbies.map((h) => h.name),
    skills: talent.skills.map((s) => s.name),
    finalDream: talent.profile?.finalDream ?? "",
    halfYearGoal: talent.profile?.halfYearGoal ?? "",
    desiredWorks: talent.desiredWorks.map((d) => d.name),
    desiredWorksOtherNote: otherDesiredWork?.note ?? "",
    social: SOCIAL_PLATFORM_ORDER.map((platform) => {
      const existing = talent.socialAccounts.find((s) => s.platform === platform);
      return {
        platform,
        url: existing?.url ?? "",
        followers: existing?.followers != null ? String(existing.followers) : "",
        label: existing?.label ?? "",
      };
    }),
  };

  return (
    <div className="space-y-6">
      <Link href={`/admin/talents/${talent.id}`} className="text-sm text-gray-500 underline">
        ← 詳細に戻る
      </Link>
      <h1 className="text-xl font-bold">{talent.stageName || "登録者"} の情報を編集</h1>
      <TalentEditForm userId={talent.id} initialData={initialData} />
    </div>
  );
}
