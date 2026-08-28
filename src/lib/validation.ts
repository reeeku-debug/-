export type RegistrantInput = {
  submitter: string;
  realityUrl: string;
  realityId: string;
  stageName: string;
  realName: string;
};

export type ValidationResult =
  | { ok: true; data: RegistrantInput }
  | { ok: false; message: string; field?: keyof RegistrantInput };

export const REQUIRED_FIELD_MESSAGE = "未入力の項目があります";
export const INVALID_URL_MESSAGE = "REALITY URLを正しく入力してください";
export const DUPLICATE_ID_MESSAGE = "このREALITY IDはすでに登録されています";

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateRegistrantInput(raw: {
  submitter?: FormDataEntryValue | null;
  realityUrl?: FormDataEntryValue | null;
  realityId?: FormDataEntryValue | null;
  stageName?: FormDataEntryValue | null;
  realName?: FormDataEntryValue | null;
}): ValidationResult {
  const submitter = String(raw.submitter ?? "").trim();
  const realityUrl = String(raw.realityUrl ?? "").trim();
  const realityId = String(raw.realityId ?? "").trim();
  const stageName = String(raw.stageName ?? "").trim();
  const realName = String(raw.realName ?? "").trim();

  if (!submitter) return { ok: false, message: REQUIRED_FIELD_MESSAGE, field: "submitter" };
  if (!realityUrl) return { ok: false, message: REQUIRED_FIELD_MESSAGE, field: "realityUrl" };
  if (!realityId) return { ok: false, message: REQUIRED_FIELD_MESSAGE, field: "realityId" };
  if (!stageName) return { ok: false, message: REQUIRED_FIELD_MESSAGE, field: "stageName" };
  if (!realName) return { ok: false, message: REQUIRED_FIELD_MESSAGE, field: "realName" };

  if (!isValidHttpUrl(realityUrl)) {
    return { ok: false, message: INVALID_URL_MESSAGE, field: "realityUrl" };
  }

  return {
    ok: true,
    data: { submitter, realityUrl, realityId, stageName, realName },
  };
}
