"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ProjectFormInput {
  name: string;
  description: string;
  genre: string;
  desiredActivities: string[];
  idealPersona: string;
  requiredConditions: string;
  otherConditions: string;
  status?: string;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("管理者権限が必要です");
  }
  return session;
}

export async function createProject(input: ProjectFormInput) {
  await requireAdmin();

  const project = await prisma.project.create({
    data: {
      name: input.name.trim(),
      description: input.description.trim(),
      genre: input.genre.trim(),
      desiredActivities: input.desiredActivities.join(","),
      idealPersona: input.idealPersona.trim() || null,
      requiredConditions: input.requiredConditions.trim() || null,
      otherConditions: input.otherConditions.trim() || null,
    },
  });

  revalidatePath("/admin/projects");
  redirect(`/admin/projects/${project.id}`);
}

export async function updateProject(projectId: string, input: ProjectFormInput) {
  await requireAdmin();

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: input.name.trim(),
      description: input.description.trim(),
      genre: input.genre.trim(),
      desiredActivities: input.desiredActivities.join(","),
      idealPersona: input.idealPersona.trim() || null,
      requiredConditions: input.requiredConditions.trim() || null,
      otherConditions: input.otherConditions.trim() || null,
      ...(input.status ? { status: input.status } : {}),
    },
  });

  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}

export async function updateProjectStatus(projectId: string, status: string) {
  await requireAdmin();

  await prisma.project.update({ where: { id: projectId }, data: { status } });

  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function deleteProject(projectId: string) {
  await requireAdmin();

  await prisma.project.delete({ where: { id: projectId } });

  revalidatePath("/admin/projects");
  redirect("/admin/projects");
}
