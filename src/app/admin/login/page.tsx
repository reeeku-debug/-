import { Suspense } from "react";
import LoginForm from "@/components/login-form";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-white">管理者ログイン</h1>
          <p className="mt-1 text-sm text-gray-400">登録者管理・案件マッチング機能を利用できます</p>
        </div>
        <div className="card">
          <Suspense>
            <LoginForm variant="admin" />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
