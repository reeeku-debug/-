"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Registrant } from "@prisma/client";
import { formatDateTimeJST } from "@/lib/date";
import DeleteButton from "./DeleteButton";

export default function RegistrantsTable({
  registrants,
}: {
  registrants: Registrant[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registrants;
    return registrants.filter((r) =>
      [r.stageName, r.realityId, r.realName, r.submitter]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, registrants]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="活動名・REALITY ID・本名・提出者で検索"
        className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <p className="mt-2 text-xs text-gray-400">{filtered.length}件表示中</p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr>
              <th className="px-4 py-3">登録日時</th>
              <th className="px-4 py-3">提出者</th>
              <th className="px-4 py-3">活動名</th>
              <th className="px-4 py-3">REALITY ID</th>
              <th className="px-4 py-3">REALITY URL</th>
              <th className="px-4 py-3">本名</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  該当する登録者がいません
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {formatDateTimeJST(r.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.submitter}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                  {r.stageName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.realityId}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <a
                    href={r.realityUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 underline hover:text-brand-700"
                  >
                    開く
                  </a>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.realName}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex gap-3">
                    <Link
                      href={`/admin/registrants/${r.id}/edit`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      編集
                    </Link>
                    <DeleteButton id={r.id} stageName={r.stageName} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
