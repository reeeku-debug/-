import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold">回答者ログイン</h1>
          <p className="mt-1 text-sm text-gray-500">プロフィール情報の登録・確認ができます</p>
        </div>
        <div className="card">
          <Suspense>
            <LoginForm variant="respondent" />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm text-gray-600">
          アカウントをお持ちでない方は
          <Link href="/register" className="ml-1 text-brand-600 underline">
            新規登録
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-gray-400">
          <Link href="/admin/login" className="underline">
            管理者の方はこちら
          </Link>
        </p>
      </div>
    </main>
  );
}
