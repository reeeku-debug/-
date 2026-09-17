"use client";

import { useState, useTransition } from "react";
import { resetTalentPasswordAction } from "@/app/admin/(dashboard)/talents/[id]/actions";

export function ResetPasswordButton({ talentId }: { talentId: string }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);

  function handleClick() {
    if (!confirm("パスワードを再発行しますか？現在のパスワードは使用できなくなります。")) return;
    startTransition(async () => {
      const res = await resetTalentPasswordAction(talentId);
      setPassword(res.password);
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "再発行中..." : "パスワードを再発行"}
      </button>
      {password && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-mono text-amber-700">
          新しいパスワード: {password}（この画面でのみ表示されます。控えて共有してください）
        </p>
      )}
    </div>
  );
}
