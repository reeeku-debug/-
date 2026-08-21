import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SOCIAL_PLATFORMS } from "@/lib/constants";
import { formatDateTime, formatFollowers, isStale } from "@/lib/utils";
import SignOutButton from "@/components/sign-out-button";

export default async function MyPage() {
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

  const notSubmitted = !user.profile || user.profile.isDraft;
  const stale = user.profile?.submittedAt ? isStale(user.updatedAt) : false;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-gray-50 px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">マイページ</h1>
        <SignOutButton className="text-sm text-gray-500 underline" />
      </header>

      {notSubmitted && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          プロフィールがまだ送信されていません。フォームから登録を完了してください。
        </div>
      )}
      {!notSubmitted && stale && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          長期間情報が更新されていません。最新の状況に更新しましょう。
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xl font-bold">{user.stageName || "（芸名未設定）"}</p>
          <p className="text-xs text-gray-500">最終更新：{formatDateTime(user.updatedAt)}</p>
        </div>
        <Link href="/form" className="btn-primary">
          編集する
        </Link>
      </div>

      <div className="space-y-4">
        <Section title="実績・経験">
          {user.achievements.length === 0 && <Empty />}
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {user.achievements.map((a) => (
              <li key={a.id}>
                {a.content}
                {a.category ? `（${a.category}）` : ""}
                {a.yearMonth ? ` - ${a.yearMonth}` : ""}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="趣味">
          <TagList items={user.hobbies.map((h) => h.name)} />
        </Section>

        <Section title="特技">
          <TagList items={user.skills.map((s) => s.name)} />
        </Section>

        <Section title="今後の最終的な夢">
          <p className="whitespace-pre-wrap text-sm">{user.profile?.finalDream || "未入力"}</p>
        </Section>

        <Section title="半年後の目標">
          <p className="whitespace-pre-wrap text-sm">{user.profile?.halfYearGoal || "未入力"}</p>
        </Section>

        <Section title="してみたい仕事・案件">
          <TagList items={user.desiredWorks.map((d) => d.name)} />
        </Section>

        <Section title="SNS情報">
          {user.socialAccounts.length === 0 && <Empty />}
          <ul className="space-y-1 text-sm">
            {user.socialAccounts.map((s) => {
              const label =
                s.platform === "OTHER"
                  ? s.label || "その他SNS"
                  : SOCIAL_PLATFORMS.find((p) => p.value === s.platform)?.label ?? s.platform;
              return (
                <li key={s.id}>
                  <span className="font-medium">{label}</span>：
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                      {s.url}
                    </a>
                  ) : (
                    "URL未登録"
                  )}
                  {s.followers != null ? `（フォロワー ${formatFollowers(s.followers)}）` : ""}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400">未入力</p>;
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {item}
        </span>
      ))}
    </div>
  );
}
