"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isLoginConfigured,
  safeNextPath,
  verifyPassword,
} from "@/lib/session";

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isLoginConfigured()) return { error: "DASHBOARD_PASSWORD が設定されていません（環境変数を設定してください）" };
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password))) return { error: "パスワードが正しくありません" };
  cookies().set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(safeNextPath(formData.get("next")));
}

export async function logoutAction() {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
