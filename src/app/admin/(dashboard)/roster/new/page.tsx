import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewTalentForm from "./new-talent-form";

export default async function NewTalentPage() {
  const companies = await prisma.company.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/roster" className="text-sm text-gray-500 underline">
        ← タレント一覧に戻る
      </Link>
      <h1 className="text-xl font-bold">タレントを登録</h1>
      <NewTalentForm companies={companies} />
    </div>
  );
}
