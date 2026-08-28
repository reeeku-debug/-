import { adminLogin } from "./actions";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const hasError = searchParams.error === "1";
  const next = searchParams.next ?? "/admin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-bold text-gray-900">
          管理画面ログイン
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          REALITY新規登録管理
        </p>

        <form action={adminLogin} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {hasError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              パスワードが正しくありません。
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-700"
          >
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
