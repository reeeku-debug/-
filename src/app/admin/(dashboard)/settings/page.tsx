import { adminLogout } from "../../login/actions";

export default function SettingsPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      <div className="mt-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">管理画面パスワード</h2>
          <p className="mt-1 text-sm text-gray-500">
            環境変数 <code className="rounded bg-gray-100 px-1.5 py-0.5">ADMIN_PASSWORD</code>{" "}
            を変更することでログインパスワードを更新できます。変更後はサーバーの再起動が必要です。
          </p>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h2 className="text-sm font-semibold text-gray-700">セッション</h2>
          <p className="mt-1 text-sm text-gray-500">
            ログイン状態は14日間保持されます。共有端末では利用後にログアウトしてください。
          </p>
          <form action={adminLogout} className="mt-3">
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
