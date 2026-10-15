"use client";

import { useState, useTransition } from "react";
import { updateAdminNote } from "@/app/admin/(dashboard)/talents/[id]/actions";

export default function AdminNoteEditor({ userId, initialContent }: { userId: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateAdminNote(userId, content);
      setSaved(true);
    });
  }

  return (
    <div>
      <textarea
        className="field-textarea"
        rows={4}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        placeholder="例：ゲーム案件との相性が良い、大型案件はスケジュール確認が必要 など"
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={isPending || saved} className="btn-secondary">
          {isPending ? "保存中..." : "メモを保存"}
        </button>
        {saved && <span className="text-xs text-gray-400">保存済み</span>}
      </div>
    </div>
  );
}
