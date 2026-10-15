import { isLoginConfigured, safeNextPath } from "@/lib/session";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-white">配信収益ダッシュボード</h1>
          <p className="mt-1 text-sm text-gray-400">IRIAM・Avvy・Mirrativ の収益・KPI管理</p>
        </div>
        <div className="card">
          {!isLoginConfigured() && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              環境変数 DASHBOARD_PASSWORD が未設定のためログインできません。Vercel の Environment Variables に設定してください。
            </p>
          )}
          <LoginForm next={safeNextPath(searchParams.next)} />
        </div>
      </div>
    </main>
  );
}
