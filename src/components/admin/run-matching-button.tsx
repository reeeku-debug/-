"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { runMatching } from "@/app/admin/(dashboard)/projects/[id]/actions";

export default function RunMatchingButton({ projectId, hasCandidates }: { projectId: string; hasCandidates: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await runMatching(projectId);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="btn-primary">
      {isPending ? "分析中..." : hasCandidates ? "再度マッチングする" : "候補者を探す（マッチング開始）"}
    </button>
  );
}
