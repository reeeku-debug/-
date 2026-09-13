import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** マネージャー専用のServer Action/ページで使用。権限がなければ例外を投げる。 */
export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("マネージャー権限が必要です。");
  }
  return session;
}
