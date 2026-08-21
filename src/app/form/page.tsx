import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Wizard from "@/components/form/wizard";
import { SOCIAL_PLATFORM_ORDER, type TalentFormData } from "@/lib/types";

export default async function FormPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESPONDENT") redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      profile: true,
      achievements: true,
      hobbies: true,
      skills: true,
      desiredWorks: true,
      socialAccounts: true,
    },
  });
  if (!user) redirect("/login");

  const otherDesiredWork = user.desiredWorks.find((d) => d.name === "その他");

  const initialData: TalentFormData = {
    realName: user.realName ?? "",
    stageName: user.stageName ?? "",
    achievements:
      user.achievements.length > 0
        ? user.achievements.map((a) => ({
            content: a.content,
            category: a.category ?? "",
            yearMonth: a.yearMonth ?? "",
          }))
        : [{ content: "", category: "", yearMonth: "" }],
    hobbies: user.hobbies.map((h) => h.name),
    skills: user.skills.map((s) => s.name),
    finalDream: user.profile?.finalDream ?? "",
    halfYearGoal: user.profile?.halfYearGoal ?? "",
    desiredWorks: user.desiredWorks.map((d) => d.name),
    desiredWorksOtherNote: otherDesiredWork?.note ?? "",
    social: SOCIAL_PLATFORM_ORDER.map((platform) => {
      const existing = user.socialAccounts.find((s) => s.platform === platform);
      return {
        platform,
        url: existing?.url ?? "",
        followers: existing?.followers != null ? String(existing.followers) : "",
        label: existing?.label ?? "",
      };
    }),
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-4 py-3 text-center text-sm font-semibold text-gray-700">
        プロフィール登録フォーム
      </header>
      <Wizard userId={user.id} initialData={initialData} />
    </main>
  );
}
