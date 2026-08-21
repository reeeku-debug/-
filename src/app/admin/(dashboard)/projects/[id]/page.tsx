import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PROJECT_ACTIVITY_OPTIONS, PROJECT_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { formatDateTime, cn } from "@/lib/utils";
import RunMatchingButton from "@/components/admin/run-matching-button";
import StatusSelect from "@/components/admin/status-select";
import CandidateCard, { type CandidateCardData } from "@/components/admin/candidate-card";

const STATUS_SORT_ORDER: Record<string, number> = {
  FAVORITE: 0,
  SHORTLISTED: 1,
  SUGGESTED: 2,
  EXCLUDED: 3,
};

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      candidates: {
        include: { user: true },
      },
    },
  });
  if (!project) notFound();

  const sortedCandidates = [...project.candidates].sort((a, b) => {
    const statusDiff = (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return b.matchScore - a.matchScore;
  });

  const candidateCards: CandidateCardData[] = sortedCandidates.map((c, i) => ({
    id: c.id,
    userId: c.userId,
    rank: i + 1,
    stageName: c.user.stageName || "（芸名未設定）",
    matchScore: c.matchScore,
    reasons: safeParseReasons(c.reasons),
    summary: buildSummaryFallback(c.user.stageName, safeParseReasons(c.reasons)),
    status: c.status,
    adminNote: c.adminNote,
  }));

  const activities = project.desiredActivities ? project.desiredActivities.split(",").filter(Boolean) : [];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/projects" className="text-sm text-gray-500 underline">
          ← 案件一覧に戻る
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-sm text-gray-500">
              {project.genre} ・ 登録日 {formatDateTime(project.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusSelect projectId={project.id} status={project.status} />
            <Link href={`/admin/projects/${project.id}/edit`} className="btn-secondary">
              編集する
            </Link>
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <Row label="案件内容">{project.description}</Row>
        <Row label="希望する活動">
          {activities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {PROJECT_ACTIVITY_OPTIONS.filter((a) => activities.includes(a)).map((a) => (
                <span key={a} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                  {a}
                </span>
              ))}
            </div>
          ) : (
            "未設定"
          )}
        </Row>
        <Row label="求める人物像">{project.idealPersona || "未設定"}</Row>
        <Row label="必須条件">{project.requiredConditions || "未設定"}</Row>
        <Row label="その他条件">{project.otherConditions || "未設定"}</Row>
        <Row label="現在のステータス">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor(PROJECT_STATUS_OPTIONS, project.status))}>
            {statusLabel(PROJECT_STATUS_OPTIONS, project.status)}
          </span>
        </Row>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">マッチング結果</h2>
        <RunMatchingButton projectId={project.id} hasCandidates={candidateCards.length > 0} />
      </div>

      {candidateCards.length === 0 ? (
        <p className="card py-12 text-center text-sm text-gray-400">
          まだマッチングが実行されていません。「候補者を探す」ボタンを押すと、登録者全員の情報を分析して適した人をランキング表示します。
        </p>
      ) : (
        <div className="space-y-4">
          {candidateCards.map((c) => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function safeParseReasons(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSummaryFallback(stageName: string | null, reasons: string[]): string {
  const name = stageName || "この方";
  const body = reasons
    .slice(0, 4)
    .map((r, i) => (i === 0 ? r : `また、${r}`))
    .join("。");
  return body ? `${name}は、${body}。以上の点から、本案件との親和性が高いと判断しました。` : "";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm text-gray-800">{children}</div>
    </div>
  );
}
