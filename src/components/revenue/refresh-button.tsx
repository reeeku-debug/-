"use client";

import { useTransition } from "react";
import { refreshRevenueData } from "@/app/admin/(dashboard)/revenue/actions";

export default function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => refreshRevenueData())}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? "再読込中…" : "↻ データを再読込"}
    </button>
  );
}
