"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface RevenueTab {
  href: string;
  label: string;
  /** 期間指定を引き継ぐタブ */
  keepPeriod?: boolean;
}

export default function RevenueTabs({ tabs }: { tabs: RevenueTab[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = new URLSearchParams();
  for (const key of ["p", "m", "from", "to"]) {
    const v = searchParams.get(key);
    if (v) period.set(key, v);
  }
  const query = period.toString();

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-gray-200 text-sm">
      {tabs.map((tab) => {
        const active = tab.href === "/admin/revenue" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.keepPeriod && query ? `${tab.href}?${query}` : tab.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 font-medium transition",
              active
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
