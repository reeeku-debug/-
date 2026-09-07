import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin-login-form";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="text-center">
        <p className="text-3xl">🔐</p>
        <h1 className="mt-3 text-xl font-bold">管理者ログイン</h1>
        <p className="mt-1 text-sm text-gray-500">タレント管理ダッシュボードにアクセスします</p>
      </div>
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </main>
  );
}
