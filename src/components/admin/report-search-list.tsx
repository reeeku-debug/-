"use client";

import { useMemo, useState } from "react";
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

export function ReportSearchList({ reports }: { reports: ReportRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) =>
      [r.talent.name, r.talent.managementNo, r.stepTemplate.title, r.comment]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [reports, query]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="タレント名・No.・STEP名・コメントで検索"
        className="w-full max-w-sm rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
      />
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          該当する完了報告はありません。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((r) => (
            <ReportReviewCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
