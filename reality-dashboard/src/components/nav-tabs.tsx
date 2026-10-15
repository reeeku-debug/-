"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "ティア一覧" },
  { href: "/import", label: "CSV取込" },
  { href: "/settings", label: "判定基準・設定" },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-gray-200 text-sm">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 font-medium transition",
              active ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
