"use client";

import { useState, useTransition } from "react";
import { approveStampClaimAction, rejectStampClaimAction } from "@/app/admin/(dashboard)/stamps/actions";
import { formatDateJST } from "@/lib/utils";

type ClaimLite = {
  id: string;
  comment: string | null;
  imageUrl: string | null;
  relatedUrl: string | null;
  submittedAt: Date;
  talent: { id: string; name: string; managementNo: string | null };
};

export function StampClaimReviewCard({ claim, onDone }: { claim: ClaimLite; onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveStampClaimAction(claim.id);
      if (!res.success) setError(res.error);
      else {
        setDone(true);
        onDone?.();
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectStampClaimAction(claim.id, reason);
      if (!res.success) setError(res.error);
      else {
        setDone(true);
        onDone?.();
      }
    });
  }

  if (done) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {claim.talent.managementNo && (
              <span className="mr-1 font-mono text-xs text-gray-400">No.{claim.talent.managementNo}</span>
            )}
            {claim.talent.name}さん
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{formatDateJST(claim.submittedAt)} 申請</p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
          確認待ち
        </span>
      </div>

      {claim.comment && (
        <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 p-2.5 text-sm text-gray-700">
          {claim.comment}
        </p>
      )}
      {claim.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={claim.imageUrl}
          alt="添付画像"
          className="mt-2 max-h-48 rounded-lg border border-gray-200 object-contain"
        />
      )}
      {claim.relatedUrl && (
        <a
          href={claim.relatedUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-sm text-brand-600 underline"
        >
          {claim.relatedUrl}
        </a>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!rejecting ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleApprove}
            disabled={pending}
            className="flex-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            ✅ 承認する
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="flex-1 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            ❌ 差し戻す
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="差し戻し理由（任意）"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setRejecting(false)}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleReject}
              disabled={pending}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            >
              {pending ? "送信中..." : "差し戻す"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
