import { searchTalents, type TalentSearchParams } from "@/lib/search";
import TalentTable from "@/components/admin/talent-table";
import { SOCIAL_PLATFORMS } from "@/lib/constants";

interface SearchQuery {
  hobby?: string;
  skill?: string;
  achievement?: string;
  desiredWork?: string;
  snsPlatform?: string;
  minFollowers?: string;
  halfYearGoal?: string;
  finalDream?: string;
}

export default async function AdminSearchPage({ searchParams }: { searchParams: SearchQuery }) {
  const params: TalentSearchParams = {
    hobby: searchParams.hobby,
    skill: searchParams.skill,
    achievement: searchParams.achievement,
    desiredWork: searchParams.desiredWork,
    snsPlatform: searchParams.snsPlatform,
    minFollowers: searchParams.minFollowers ? Number.parseInt(searchParams.minFollowers, 10) : undefined,
    halfYearGoal: searchParams.halfYearGoal,
    finalDream: searchParams.finalDream,
  };

  const hasCondition = Object.values(params).some((v) => v !== undefined && v !== "" && !Number.isNaN(v));
  const talents = hasCondition ? await searchTalents(params) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">検索・絞り込み</h1>
        <p className="text-sm text-gray-500">複数条件を組み合わせて登録者を絞り込めます</p>
      </div>

      <form className="card grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="実績" name="achievement" defaultValue={searchParams.achievement} placeholder="例：MC" />
        <Field label="趣味" name="hobby" defaultValue={searchParams.hobby} placeholder="例：ゲーム" />
        <Field label="特技" name="skill" defaultValue={searchParams.skill} placeholder="例：歌" />
        <Field
          label="やりたい仕事"
          name="desiredWork"
          defaultValue={searchParams.desiredWork}
          placeholder="例：ゲーム案件"
        />
        <div>
          <label className="field-label">SNS種類</label>
          <select name="snsPlatform" defaultValue={searchParams.snsPlatform ?? ""} className="field-input">
            <option value="">指定なし</option>
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="フォロワー数（以上）"
          name="minFollowers"
          type="number"
          defaultValue={searchParams.minFollowers}
          placeholder="例：10000"
        />
        <Field
          label="半年後の目標"
          name="halfYearGoal"
          defaultValue={searchParams.halfYearGoal}
          placeholder="例：登録者1万人"
        />
        <Field label="最終的な夢" name="finalDream" defaultValue={searchParams.finalDream} placeholder="例：声優" />

        <div className="flex items-end gap-2 lg:col-span-3">
          <button type="submit" className="btn-primary">
            この条件で検索
          </button>
          <a href="/admin/search" className="btn-secondary">
            条件をクリア
          </a>
        </div>
      </form>

      {hasCondition ? (
        <>
          <p className="text-sm text-gray-500">{talents.length} 件ヒットしました</p>
          <TalentTable talents={talents} />
        </>
      ) : (
        <p className="py-12 text-center text-sm text-gray-400">条件を入力して検索してください</p>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field-input"
      />
    </div>
  );
}
