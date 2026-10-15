import NavTabs from "@/components/nav-tabs";
import { logoutAction } from "@/app/login/actions";
import { refreshAction } from "./actions";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 md:px-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">
              REALITY ティア判定
            </h1>
            <p className="text-sm text-gray-500">配信レポートCSVを取り込むと、各月を評価月として T1〜T5 を自動判定します</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <form action={refreshAction}>
              <button type="submit" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
                最新に更新
              </button>
            </form>
            <form action={logoutAction}>
              <button type="submit" className="text-xs text-gray-500 underline hover:text-gray-800">
                ログアウト
              </button>
            </form>
          </div>
        </div>
        <NavTabs />
      </div>
      {children}
    </div>
  );
}
