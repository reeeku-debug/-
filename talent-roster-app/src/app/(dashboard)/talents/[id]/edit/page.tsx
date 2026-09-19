import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EditTalentForm from "./edit-talent-form";

export default async function EditTalentPage({ params }: { params: { id: string } }) {
  const [talent, companies] = await Promise.all([
    prisma.talent.findUnique({ where: { id: params.id }, include: { bankAccount: true } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!talent) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/talents/${talent.id}`} className="text-sm text-gray-500 underline">
        ← タレント詳細に戻る
      </Link>
      <h1 className="text-xl font-bold">
        {talent.lastName} {talent.firstName} さんの情報を編集
      </h1>
      <EditTalentForm talent={talent} companies={companies} />
    </div>
  );
}
