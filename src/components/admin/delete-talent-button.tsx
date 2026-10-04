"use client";

import { useState, useTransition } from "react";
import { deleteTalentAction } from "@/app/admin/(dashboard)/talents/actions";

export function DeleteTalentButton({ talentId, talentName }: { talentId: string; talentName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(`${talentName}さんを削除します。進捗データもすべて削除されます。よろしいですか？`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteTalentAction(talentId);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
      >
        {pending ? "削除中..." : "削除"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
