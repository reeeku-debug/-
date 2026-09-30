import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Server Action 用：ログインしていなければエラー */
export async function requireSession() {
  const ok = await verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  if (!ok) throw new Error("ログインが必要です");
}
