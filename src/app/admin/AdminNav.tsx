"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLogout } from "./login/actions";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/register", label: "新規登録" },
  { href: "/admin/registrants", label: "登録者一覧" },
  { href: "/admin/export", label: "CSV出力" },
  { href: "/admin/settings", label: "設定" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 md:h-screen md:w-56 md:shrink-0 md:flex-col md:gap-0.5 md:overflow-visible md:border-b-0 md:border-r md:p-4">
      <div className="hidden px-2 pb-4 text-lg font-bold text-gray-900 md:block">
        REALITY登録管理
      </div>
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
              active
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <form action={adminLogout} className="mt-auto hidden md:block md:pt-4">
        <button
          type="submit"
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </form>
      <form action={adminLogout} className="shrink-0 md:hidden">
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-gray-500 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </form>
    </nav>
  );
}
