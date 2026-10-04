"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("admin-login", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      return;
    }

    const callbackUrl = searchParams.get("callbackUrl");
    router.push(callbackUrl || "/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
          パスワード
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
      >
        {loading ? "ログイン中..." : "マネージャーログイン"}
      </button>
    </form>
  );
}
