"use client";

import Link from "next/link";
import ProjectForm from "@/components/admin/project-form";
import { createProject, type ProjectFormInput } from "@/app/admin/(dashboard)/projects/actions";

const EMPTY: ProjectFormInput = {
  name: "",
  description: "",
  genre: "",
  desiredActivities: [],
  idealPersona: "",
  requiredConditions: "",
  otherConditions: "",
};

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/projects" className="text-sm text-gray-500 underline">
        ← 案件一覧に戻る
      </Link>
      <h1 className="text-xl font-bold">新しい案件を登録</h1>
      <ProjectForm initialData={EMPTY} onSubmit={createProject} submitLabel="登録する" />
    </div>
  );
}
