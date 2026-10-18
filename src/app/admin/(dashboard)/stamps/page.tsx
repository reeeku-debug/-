import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StampItemCard } from "@/components/admin/stamp-item-card";
import { CreateStampItemForm } from "@/components/admin/create-stamp-item-form";
import { PatternSwitcher } from "@/components/admin/pattern-switcher";

export default async function AdminStampsPage({
  searchParams,
}: {
  searchParams: { pattern?: string };
}) {
  const allPatterns = await prisma.stepPattern.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { stampItems: true, talents: true } } },
  });
  if (allPatterns.length === 0) notFound();

  const currentPattern =
    allPatterns.find((p) => p.id === searchParams.pattern) ??
    allPatterns.find((p) => p.isDefault) ??
    allPatterns[0];

  const [items, pendingClaims, approvedCounts] = await Promise.all([
    prisma.stampItem.findMany({ where: { patternId: currentPattern.id }, orderBy: { order: "asc" } }),
    prisma.stampClaim.findMany({
      where: { status: "PENDING", stampItem: { patternId: currentPattern.id } },
      orderBy: { submittedAt: "asc" },
      include: { talent: true },
    }),
    prisma.stampClaim.groupBy({
      by: ["stampItemId"],
      where: { status: "APPROVED", stampItem: { patternId: currentPattern.id } },
      _count: true,
    }),
  ]);

  const earnedCountByItem = new Map(approvedCounts.map((c) => [c.stampItemId, c._count]));
  const pendingByItem = new Map<string, typeof pendingClaims>();
  for (const c of pendingClaims) {
    const list = pendingByItem.get(c.stampItemId) ?? [];
    list.push(c);
    pendingByItem.set(c.stampItemId, list);
  }

  const patternOptions = allPatterns.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isDefault: p.isDefault,
    group: p.group,
    itemCount: p._count.stampItems,
    talentCount: p._count.talents,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">スタンプラリー管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          STEPロードマップとは別に、順不同で達成できる実績スタンプを管理できます。タレントからの申請はここで承認・差し戻しできます。
        </p>
      </div>

      <PatternSwitcher
        patterns={patternOptions}
        currentPatternId={currentPattern.id}
        basePath="/admin/stamps"
        itemLabel="スタンプ"
      />

      <div className="space-y-3">
        {items.map((item, idx) => (
          <StampItemCard
            key={item.id}
            item={item}
            pendingClaims={pendingByItem.get(item.id) ?? []}
            earnedCount={earnedCountByItem.get(item.id) ?? 0}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            まだスタンプが登録されていません。下のボタンから追加してください。
          </div>
        )}
      </div>

      <CreateStampItemForm patternId={currentPattern.id} />
    </div>
  );
}
