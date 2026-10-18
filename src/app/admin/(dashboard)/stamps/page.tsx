import { prisma } from "@/lib/prisma";
import { StampItemCard } from "@/components/admin/stamp-item-card";
import { CreateStampItemForm } from "@/components/admin/create-stamp-item-form";

export default async function AdminStampsPage() {
  const [items, pendingClaims, approvedCounts] = await Promise.all([
    prisma.stampItem.findMany({ orderBy: { order: "asc" } }),
    prisma.stampClaim.findMany({
      where: { status: "PENDING" },
      orderBy: { submittedAt: "asc" },
      include: { talent: true },
    }),
    prisma.stampClaim.groupBy({ by: ["stampItemId"], where: { status: "APPROVED" }, _count: true }),
  ]);

  const earnedCountByItem = new Map(approvedCounts.map((c) => [c.stampItemId, c._count]));
  const pendingByItem = new Map<string, typeof pendingClaims>();
  for (const c of pendingClaims) {
    const list = pendingByItem.get(c.stampItemId) ?? [];
    list.push(c);
    pendingByItem.set(c.stampItemId, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">スタンプラリー管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          STEPロードマップとは別に、順不同で達成できる実績スタンプを管理できます。タレントからの申請はここで承認・差し戻しできます。
        </p>
      </div>

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

      <CreateStampItemForm />
    </div>
  );
}
