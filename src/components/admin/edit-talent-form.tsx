"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTalentInfoAction } from "@/app/admin/(dashboard)/talents/[id]/actions";

type TalentInput = {
  id: string;
  name: string;
  activityName: string | null;
  firstStreamDate: string | null;
  notes: string | null;
};

export function EditTalentForm({ talent }: { talent: TalentInput }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await updateTalentInfoAction(talent.id, formData);
    setPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    router.push(`/admin/talents/${talent.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">タレント名 *</label>
        <input
          name="name"
          defaultValue={talent.name}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">活動名</label>
        <input
          name="activityName"
          defaultValue={talent.activityName ?? ""}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">初配信予定日</label>
        <input
          type="date"
          name="firstStreamDate"
          defaultValue={talent.firstStreamDate ?? ""}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">備考</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={talent.notes ?? ""}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}
