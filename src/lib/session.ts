import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** 管理者専用のServer Action/ページで使用。権限がなければ例外を投げる。 */
export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("管理者権限が必要です。");
  }
  return session;
}

/** タレント専用のServer Actionで使用。権限がなければ例外を投げる。 */
export async function requireTalentSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "TALENT") {
    throw new Error("ログインが必要です。");
  }
  return session;
}
