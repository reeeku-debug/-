import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SignOutButton from "@/components/sign-out-button";
import AdminNavLink from "@/components/admin/admin-nav-link";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード", icon: "📊" },
  { href: "/admin/talents", label: "登録者一覧", icon: "👥" },
  { href: "/admin/search", label: "検索・絞り込み", icon: "🔍" },
  { href: "/admin/projects", label: "案件管理", icon: "📁" },
  { href: "/admin/matching", label: "案件マッチング", icon: "🤝" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-gray-900 text-gray-100 md:flex">
        <div className="px-5 py-6">
          <p className="text-sm font-bold tracking-wide text-white">管理者メニュー</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <AdminNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>
        <div className="border-t border-gray-800 px-5 py-4 text-xs text-gray-400">
          <p className="truncate">{session.user.email}</p>
          <SignOutButton className="mt-1 underline hover:text-gray-200" />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
          <span className="font-bold">管理者メニュー</span>
          <SignOutButton className="text-sm text-gray-500 underline" />
        </header>
        <nav className="flex gap-3 overflow-x-auto border-b bg-white px-4 py-2 text-sm md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-gray-600">
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
