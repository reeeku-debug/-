"use client";

import { useMemo, useState } from "react";
import { TalentManageTable } from "./talent-manage-table";

type TalentRow = {
  id: string;
  name: string;
  managementNo: string | null;
  loginId: string;
  slug: string;
  activityName: string | null;
  startMonth: string | null;
  firstStreamDate: Date | null;
};

export function TalentTableWithSearch({ talents, origin }: { talents: TalentRow[]; origin: string }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return talents;
    return talents.filter((t) =>
      [t.name, t.managementNo, t.loginId, t.activityName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [talents, query]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="タレント名・No.・ログインID・本名で検索"
        className="w-full max-w-sm rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-700"
      />
      <TalentManageTable talents={filtered} origin={origin} />
    </div>
  );
}
