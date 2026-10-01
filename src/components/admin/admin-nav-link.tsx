"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function AdminNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-brand-500 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
