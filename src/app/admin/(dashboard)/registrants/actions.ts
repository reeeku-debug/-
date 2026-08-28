"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteRegistrant, updateRegistrant } from "@/lib/registrants";
import { validateRegistrantInput } from "@/lib/validation";

export async function deleteRegistrantAction(id: string) {
  await deleteRegistrant(id);
  revalidatePath("/admin");
  revalidatePath("/admin/registrants");
}

export type EditFormState = {
  status: "idle" | "error";
  message?: string;
  field?: string;
};

export async function updateRegistrantAction(
  id: string,
  _prevState: EditFormState,
  formData: FormData
): Promise<EditFormState> {
  const validation = validateRegistrantInput({
    submitter: formData.get("submitter"),
    realityUrl: formData.get("realityUrl"),
    realityId: formData.get("realityId"),
    stageName: formData.get("stageName"),
    realName: formData.get("realName"),
  });

  if (!validation.ok) {
    return { status: "error", message: validation.message, field: validation.field };
  }

  const result = await updateRegistrant(id, validation.data);
  if (!result.ok) {
    return { status: "error", message: result.message, field: result.field };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/registrants");
  redirect("/admin/registrants?updated=1");
}
