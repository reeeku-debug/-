"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectStatus } from "@/app/admin/(dashboard)/projects/actions";
import { PROJECT_STATUS_OPTIONS } from "@/lib/constants";

export default function StatusSelect({ projectId, status }: { projectId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      className="field-input w-auto"
      value={status}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await updateProjectStatus(projectId, next);
          router.refresh();
        });
      }}
    >
      {PROJECT_STATUS_OPTIONS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
