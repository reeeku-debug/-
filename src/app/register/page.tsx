"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stageName, setStageName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, stageName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "登録に失敗しました");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/form");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold">新規登録</h1>
          <p className="mt-1 text-sm text-gray-500">アカウントを作成してプロフィールを登録しましょう</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="field-label" htmlFor="stageName">
              芸名・活動名
            </label>
            <input
              id="stageName"
              className="field-input"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="例：大内りくう"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              パスワード（8文字以上）
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "登録中..." : "登録する"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">
          既にアカウントをお持ちの方は
          <Link href="/login" className="ml-1 text-brand-600 underline">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
