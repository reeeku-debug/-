import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request";
import { TalentManageTable } from "@/components/admin/talent-manage-table";

export default async function AdminTalentsPage() {
  const talents = await prisma.talent.findMany({ orderBy: { createdAt: "desc" } });
  const origin = getRequestOrigin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">タレント管理</h1>
        <Link
          href="/admin/talents/new"
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          ＋ タレントを追加
        </Link>
      </div>
      <TalentManageTable talents={talents} origin={origin} />
    </div>
  );
}
