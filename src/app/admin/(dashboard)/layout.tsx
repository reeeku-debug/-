import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminNavLink } from "@/components/admin/admin-nav-link";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      <aside className="border-b border-gray-200 bg-white px-4 py-4 lg:min-h-screen lg:w-60 lg:border-b-0 lg:border-r lg:px-3 lg:py-6">
        <div className="mb-6 flex items-center justify-between lg:mb-8 lg:flex-col lg:items-start lg:gap-1">
          <p className="text-sm font-bold text-gray-900">🚩 ロードマップ管理</p>
          <p className="text-xs text-gray-400">{session.user.name}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
          <AdminNavLink href="/admin" label="ダッシュボード" icon="📊" exact />
          <AdminNavLink href="/admin/talents" label="タレント管理" icon="👤" />
          <AdminNavLink href="/admin/reports" label="完了報告確認" icon="📨" />
          <AdminNavLink href="/admin/steps" label="STEP管理" icon="🛠️" />
        </nav>
        <div className="mt-6 hidden lg:block">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
