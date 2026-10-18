"use client";

import { useTransition } from "react";
import { setStepStatusAction } from "@/app/admin/(dashboard)/talents/[id]/actions";
import { STEP_STATUS_BADGE_CLASS, STEP_STATUS_LABEL } from "@/lib/constants";

type StepLite = { id: string; order: number; icon: string; title: string; type: string };

export function AdminStepRow({
  talentId,
  step,
  status,
}: {
  talentId: string;
  step: StepLite;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: "clear" | "revert" | "lock" | "skip") {
    startTransition(async () => {
      await setStepStatusAction(talentId, step.id, action);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{step.icon}</span>
        <p className="text-sm font-semibold">{step.title}</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STEP_STATUS_BADGE_CLASS[status] ?? "border-gray-200 bg-gray-100 text-gray-400"}`}
        >
          {STEP_STATUS_LABEL[status] ?? status}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          disabled={pending}
          onClick={() => run("clear")}
          className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          CLEARにする
        </button>
        <button
          disabled={pending}
          onClick={() => run("revert")}
          className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          未達成に戻す
        </button>
        <button
          disabled={pending}
          onClick={() => run("lock")}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          ロックする
        </button>
        <button
          disabled={pending}
          onClick={() => run("skip")}
          className="rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
        >
          スキップする
        </button>
      </div>
    </div>
  );
}
