import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProjectForm from "@/components/admin/project-form";
import { updateProject, type ProjectFormInput } from "@/app/admin/(dashboard)/projects/actions";

export default async function EditProjectPage({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) notFound();

  const initialData: ProjectFormInput = {
    name: project.name,
    description: project.description,
    genre: project.genre,
    desiredActivities: project.desiredActivities ? project.desiredActivities.split(",").filter(Boolean) : [],
    idealPersona: project.idealPersona ?? "",
    requiredConditions: project.requiredConditions ?? "",
    otherConditions: project.otherConditions ?? "",
    status: project.status,
  };

  async function handleUpdate(input: ProjectFormInput) {
    "use server";
    await updateProject(project!.id, input);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/admin/projects/${project.id}`} className="text-sm text-gray-500 underline">
        ← 案件詳細に戻る
      </Link>
      <h1 className="text-xl font-bold">案件を編集</h1>
      <ProjectForm initialData={initialData} showStatus onSubmit={handleUpdate} submitLabel="更新する" />
    </div>
  );
}
