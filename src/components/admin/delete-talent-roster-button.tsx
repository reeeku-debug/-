"use client";

import { useState, useTransition } from "react";
import { deleteTalent } from "@/app/admin/(dashboard)/roster/actions";

export default function DeleteTalentRosterButton({ talentId, name }: { talentId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteTalent(talentId);
    });
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-danger">
        削除する
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
      <span className="text-sm font-medium text-red-700">
        「{name}」を完全に削除します（銀行情報・入金履歴も削除されます）。元に戻せません。
        在籍状況を「退所」に変更する方法も検討してください。よろしいですか？
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="btn-danger whitespace-nowrap"
      >
        {isPending ? "削除中..." : "削除を実行"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="btn-secondary whitespace-nowrap !px-3 !py-1.5 text-sm"
      >
        キャンセル
      </button>
    </div>
  );
}
