"use client";

import { useState } from "react";
import Link from "next/link";
import { ReportReviewCard } from "./report-review-card";

type ReportRow = {
  id: string;
  comment: string | null;
  imageUrl: string | null;
  relatedUrl: string | null;
  submittedAt: Date;
  talent: { id: string; name: string; managementNo: string | null };
  stepTemplate: { title: string; icon: string };
};

export function TalentReportGroup({ talentId, talentName, managementNo, reports }: {
  talentId: string;
  talentName: string;
  managementNo: string | null;
  reports: ReportRow[];
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const remaining = reports.filter((r) => !doneIds.has(r.id));

  if (remaining.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={`/admin/talents/${talentId}`} className="font-bold hover:underline">
          {managementNo && <span className="mr-2 font-mono text-sm text-gray-400">No.{managementNo}</span>}
          {talentName}さん
        </Link>
        <span className="shrink-0 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
          {remaining.length}件
        </span>
      </div>
      <div className="space-y-3">
        {remaining.map((r) => (
          <ReportReviewCard
            key={r.id}
            report={r}
            showTalentName={false}
            onDone={() => setDoneIds((prev) => new Set(prev).add(r.id))}
          />
        ))}
      </div>
    </div>
  );
}
