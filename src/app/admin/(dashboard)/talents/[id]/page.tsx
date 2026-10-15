import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SOCIAL_PLATFORMS } from "@/lib/constants";
import { formatDateTime, formatFollowers, isStale } from "@/lib/utils";
import AdminNoteEditor from "@/components/admin/admin-note-editor";
import DeleteTalentButton from "@/components/admin/delete-talent-button";

export default async function TalentDetailPage({ params }: { params: { id: string } }) {
  const talent = await prisma.user.findUnique({
    where: { id: params.id, role: "RESPONDENT" },
    include: {
      profile: true,
      achievements: true,
      hobbies: true,
      skills: true,
      desiredWorks: true,
      socialAccounts: true,
      adminNote: true,
    },
  });
  if (!talent) notFound();

  const stale = isStale(talent.updatedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/talents" className="text-sm text-gray-500 underline">
            ← 登録者一覧に戻る
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{talent.stageName || "（芸名未設定）"}</h1>
          <p className="text-sm text-gray-500">
            最終更新：{formatDateTime(talent.updatedAt)}
            {stale && <span className="ml-2 font-semibold text-amber-600">要更新</span>}
            {(!talent.profile || talent.profile.isDraft) && (
              <span className="ml-2 font-semibold text-gray-500">未送信（一時保存中）</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/talents/${talent.id}/edit`} className="btn-primary">
            編集する
          </Link>
          <DeleteTalentButton userId={talent.id} stageName={talent.stageName ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="プロフィール">
            <Row label="本名">{talent.realName || "未入力"}</Row>
            <Row label="芸名">{talent.stageName || "未入力"}</Row>
            <Row label="メールアドレス">{talent.email}</Row>
            <Row label="性別">{talent.profile?.gender || "未入力"}</Row>
            <Row label="年齢">{talent.profile?.age != null ? `${talent.profile.age}歳` : "未入力"}</Row>
            <Row label="住んでいる地域">{talent.profile?.residenceArea || "未入力"}</Row>
            <Row label="実績">
              {talent.achievements.length === 0 ? (
                "未入力"
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {talent.achievements.map((a) => (
                    <li key={a.id}>
                      {a.content}
                      {a.category ? `（${a.category}）` : ""}
                      {a.yearMonth ? ` - ${a.yearMonth}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Row>
            <Row label="趣味">{talent.hobbies.map((h) => h.name).join("、") || "未入力"}</Row>
            <Row label="特技">{talent.skills.map((s) => s.name).join("、") || "未入力"}</Row>
          </Section>

          <Section title="将来">
            <Row label="最終的な夢">
              <span className="whitespace-pre-wrap">{talent.profile?.finalDream || "未入力"}</span>
            </Row>
            <Row label="半年後の目標">
              <span className="whitespace-pre-wrap">{talent.profile?.halfYearGoal || "未入力"}</span>
            </Row>
          </Section>

          <Section title="案件">
            <Row label="してみたい仕事">{talent.desiredWorks.map((d) => d.name).join("、") || "未入力"}</Row>
          </Section>

          <Section title="SNS">
            {talent.socialAccounts.length === 0 ? (
              <p className="text-sm text-gray-400">未入力</p>
            ) : (
              <div className="space-y-1">
                {talent.socialAccounts.map((s) => {
                  const label =
                    s.platform === "OTHER"
                      ? s.label || "その他SNS"
                      : SOCIAL_PLATFORMS.find((p) => p.value === s.platform)?.label ?? s.platform;
                  return (
                    <Row key={s.id} label={label}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                          {s.url}
                        </a>
                      ) : (
                        "URL未登録"
                      )}
                      {s.followers != null ? `（フォロワー ${formatFollowers(s.followers)}）` : ""}
                    </Row>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="管理者メモ">
            <AdminNoteEditor userId={talent.id} initialContent={talent.adminNote?.content ?? ""} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      <div className="mt-0.5 text-gray-800">{children}</div>
    </div>
  );
}
