import { Suspense } from "react";
import { TalentLoginForm } from "@/components/talent-login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="text-center">
        <p className="text-3xl">🚩</p>
        <h1 className="mt-3 text-xl font-bold">タレントログイン</h1>
        <p className="mt-1 text-sm text-gray-500">
          あなた専用の活動ロードマップにアクセスします
        </p>
      </div>
      <Suspense>
        <TalentLoginForm />
      </Suspense>
    </main>
  );
}
