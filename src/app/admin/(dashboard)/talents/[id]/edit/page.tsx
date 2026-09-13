import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EditTalentForm } from "@/components/admin/edit-talent-form";

export default async function EditTalentPage({ params }: { params: { id: string } }) {
  const talent = await prisma.talent.findUnique({ where: { id: params.id } });
  if (!talent) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold">{talent.name}さんの情報を編集</h1>
      <EditTalentForm
        talent={{
          id: talent.id,
          name: talent.name,
          managementNo: talent.managementNo,
          activityName: talent.activityName,
          startMonth: talent.startMonth,
          firstStreamDate: talent.firstStreamDate ? talent.firstStreamDate.toISOString().slice(0, 10) : null,
          notes: talent.notes,
        }}
      />
    </div>
  );
}
