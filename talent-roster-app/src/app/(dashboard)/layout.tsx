import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SignOutButton from "@/components/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-gray-900 text-gray-100 md:flex">
        <div className="px-5 py-6">
          <p className="text-sm font-bold tracking-wide text-white">タレント情報管理</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <span className="block rounded-lg px-3 py-2 text-sm font-medium text-white">🗂️ タレント名簿</span>
        </nav>
        <div className="border-t border-gray-800 px-5 py-4 text-xs text-gray-400">
          <p className="truncate">{session.user.email}</p>
          <SignOutButton className="mt-1 underline hover:text-gray-200" />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
          <span className="font-bold">タレント情報管理</span>
          <SignOutButton className="text-sm text-gray-500 underline" />
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
