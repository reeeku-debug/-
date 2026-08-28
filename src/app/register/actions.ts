"use server";

import { createRegistrant } from "@/lib/registrants";
import { validateRegistrantInput } from "@/lib/validation";

export type RegisterFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  field?: string;
};

export async function registerAction(
  _prevState: RegisterFormState,
  formData: FormData
): Promise<RegisterFormState> {
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

  const result = await createRegistrant(validation.data);

  if (!result.ok) {
    return { status: "error", message: result.message, field: result.field };
  }

  return { status: "success", message: "登録が完了しました!" };
}
