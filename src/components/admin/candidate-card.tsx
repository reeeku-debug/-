"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CANDIDATE_STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/constants";
import { setCandidateStatus, setCandidateNote } from "@/app/admin/(dashboard)/projects/[id]/actions";

export interface CandidateCardData {
  id: string;
  userId: string;
  rank: number;
  stageName: string;
  matchScore: number;
  reasons: string[];
  summary: string;
  status: string;
  adminNote: string;
}

export default function CandidateCard({ candidate }: { candidate: CandidateCardData }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(candidate.adminNote);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleStatus(next: string) {
    const target = candidate.status === next ? "SUGGESTED" : next;
    startTransition(async () => {
      await setCandidateStatus(candidate.id, target);
      router.refresh();
    });
  }

  function saveNote() {
    startTransition(async () => {
      await setCandidateNote(candidate.id, note);
      router.refresh();
    });
  }

  return (
    <div className={cn("card", candidate.status === "EXCLUDED" && "opacity-60")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
            {candidate.rank}
          </div>
          <div>
            <Link href={`/admin/talents/${candidate.userId}`} className="text-lg font-bold text-brand-700 hover:underline">
              {candidate.stageName}
            </Link>
            <p className="text-sm text-gray-500">
              マッチ度：<span className="text-xl font-bold text-brand-600">{candidate.matchScore}%</span>
            </p>
          </div>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusColor(CANDIDATE_STATUS_OPTIONS, candidate.status))}>
          {statusLabel(CANDIDATE_STATUS_OPTIONS, candidate.status)}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-gray-700">おすすめ理由</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {candidate.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{candidate.summary}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <button
          type="button"
          disabled={isPending}
          onClick={() => toggleStatus("SHORTLISTED")}
          className="btn-secondary !px-3 !py-1.5 text-sm"
        >
          {candidate.status === "SHORTLISTED" ? "✓ 候補者に追加済み" : "候補者に追加"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => toggleStatus("FAVORITE")}
          className="btn-secondary !px-3 !py-1.5 text-sm"
        >
          {candidate.status === "FAVORITE" ? "★ お気に入り済み" : "お気に入り"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => toggleStatus("EXCLUDED")}
          className="btn-secondary !px-3 !py-1.5 text-sm"
        >
          {candidate.status === "EXCLUDED" ? "除外を解除" : "除外"}
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          className="btn-secondary !px-3 !py-1.5 text-sm"
        >
          管理者メモ
        </button>
        <Link href={`/admin/talents/${candidate.userId}`} className="ml-auto text-sm text-brand-600 underline">
          詳細を見る
        </Link>
      </div>

      {noteOpen && (
        <div className="mt-3">
          <textarea
            className="field-textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="この案件における候補者メモ（打診状況など）"
          />
          <button type="button" onClick={saveNote} disabled={isPending} className="btn-secondary mt-2 !px-3 !py-1.5 text-sm">
            メモを保存
          </button>
        </div>
      )}
    </div>
  );
}
