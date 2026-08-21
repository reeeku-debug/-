import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session?.user.role === "ADMIN") redirect("/admin");
  if (session?.user.role === "RESPONDENT") redirect("/mypage");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900">タレント情報マッチングシステム</h1>
        <p className="mt-2 text-sm text-gray-600">
          プロフィール登録と案件マッチングをひとつのプラットフォームで。
        </p>

        <div className="mt-10 space-y-4">
          <Link href="/login" className="btn-primary block w-full">
            回答者としてログイン
          </Link>
          <Link href="/register" className="block w-full text-sm text-brand-600 underline">
            はじめての方はこちら（新規登録）
          </Link>
        </div>

        <div className="mt-12 border-t pt-6">
          <Link href="/admin/login" className="text-sm text-gray-500 underline">
            管理者ログインはこちら
          </Link>
        </div>
      </div>
    </main>
  );
}
