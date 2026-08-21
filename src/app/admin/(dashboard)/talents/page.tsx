import { searchTalents } from "@/lib/search";
import TalentTable from "@/components/admin/talent-table";

export default async function TalentsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const talents = await searchTalents({ q: searchParams.q });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">登録者一覧</h1>
          <p className="text-sm text-gray-500">全 {talents.length} 件</p>
        </div>
      </div>

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="キーワード検索（趣味・特技・実績・やりたい仕事など）"
          className="field-input"
        />
        <button type="submit" className="btn-primary whitespace-nowrap">
          検索
        </button>
      </form>

      <TalentTable talents={talents} />
    </div>
  );
}
