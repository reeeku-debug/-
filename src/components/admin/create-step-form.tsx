"use client";

import { useRef, useState } from "react";
import { createStepAction } from "@/app/admin/(dashboard)/steps/actions";

export function CreateStepForm() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await createStepAction(formData);
    setPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    formRef.current?.reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-gray-300 bg-white py-4 text-sm font-semibold text-gray-500 hover:bg-gray-50"
      >
        ＋ STEPを追加（GOALの手前に挿入されます）
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <p className="text-sm font-bold">新しいSTEPを追加</p>
      <div className="flex gap-2">
        <div className="w-20">
          <label className="mb-1 block text-xs font-medium text-gray-600">アイコン</label>
          <input name="icon" defaultValue="✅" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">STEP名 *</label>
          <input name="title" required className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">内容・達成条件 *</label>
        <textarea name="description" rows={3} required className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">ボタン文言</label>
        <input
          name="buttonLabel"
          defaultValue="完了報告を送る"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {pending ? "追加中..." : "追加する"}
        </button>
      </div>
    </form>
  );
}
