import { listRegistrants } from "@/lib/registrants";
import RegistrantsTable from "./RegistrantsTable";

export const dynamic = "force-dynamic";

export default async function RegistrantsPage({
  searchParams,
}: {
  searchParams: { updated?: string };
}) {
  const registrants = await listRegistrants();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">登録者一覧</h1>
      <p className="mt-1 text-sm text-gray-500">
        全{registrants.length}件。活動名・REALITY ID・本名・提出者で検索できます。
      </p>

      {searchParams.updated === "1" && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          更新しました
        </div>
      )}

      <div className="mt-6">
        <RegistrantsTable registrants={registrants} />
      </div>
    </div>
  );
}
