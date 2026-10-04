import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-4xl">🚩</p>
        <h1 className="mt-4 text-2xl font-bold">VTuber活動ロードマップ</h1>
        <p className="mt-2 text-sm text-gray-500">
          活動開始までの進捗をスタンプラリー形式で管理します
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/login"
          className="w-full rounded-xl bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-600"
        >
          タレントログイン
        </Link>
        <Link
          href="/admin/login"
          className="w-full rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          マネージャーログイン
        </Link>
      </div>
    </main>
  );
}
