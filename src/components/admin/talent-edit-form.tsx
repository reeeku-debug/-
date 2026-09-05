"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TagInput from "@/components/form/tag-input";
import AchievementsEditor from "@/components/form/achievements-editor";
import SocialEditor from "@/components/form/social-editor";
import { HOBBY_OPTIONS, SKILL_OPTIONS, DESIRED_WORK_OPTIONS, GENDER_OPTIONS, PREFECTURE_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TalentFormData } from "@/lib/types";
import { adminUpdateTalent } from "@/app/admin/(dashboard)/talents/[id]/actions";

export default function TalentEditForm({
  userId,
  initialData,
}: {
  userId: string;
  initialData: TalentFormData;
}) {
  const router = useRouter();
  const [data, setData] = useState<TalentFormData>(initialData);
  const [saving, setSaving] = useState(false);

  function patch(fields: Partial<TalentFormData>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminUpdateTalent(userId, data);
      router.push(`/admin/talents/${userId}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="card space-y-4">
        <h2 className="font-semibold">基本情報</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">本名</label>
            <input className="field-input" value={data.realName} onChange={(e) => patch({ realName: e.target.value })} />
          </div>
          <div>
            <label className="field-label">芸名・活動名</label>
            <input
              className="field-input"
              value={data.stageName}
              onChange={(e) => patch({ stageName: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">性別</label>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => patch({ gender: option })}
                  className={cn("chip", data.gender === option ? "chip-selected" : "chip-unselected")}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">年齢</label>
            <input
              className="field-input"
              type="number"
              min={0}
              value={data.age}
              onChange={(e) => patch({ age: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">住んでいる地域</label>
            <select
              className="field-input"
              value={data.residenceArea}
              onChange={(e) => patch({ residenceArea: e.target.value })}
            >
              <option value="">選択してください</option>
              {PREFECTURE_OPTIONS.map((pref) => (
                <option key={pref} value={pref}>
                  {pref}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">実績・経験</h2>
        <AchievementsEditor value={data.achievements} onChange={(achievements) => patch({ achievements })} />
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">趣味・特技</h2>
        <div>
          <label className="field-label">趣味</label>
          <TagInput options={HOBBY_OPTIONS} value={data.hobbies} onChange={(hobbies) => patch({ hobbies })} />
        </div>
        <div>
          <label className="field-label">特技</label>
          <TagInput options={SKILL_OPTIONS} value={data.skills} onChange={(skills) => patch({ skills })} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">夢・目標</h2>
        <div>
          <label className="field-label">今後の最終的な夢</label>
          <textarea
            className="field-textarea"
            rows={3}
            value={data.finalDream}
            onChange={(e) => patch({ finalDream: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">半年後の目標</label>
          <textarea
            className="field-textarea"
            rows={3}
            value={data.halfYearGoal}
            onChange={(e) => patch({ halfYearGoal: e.target.value })}
          />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">してみたい仕事・案件</h2>
        <TagInput
          options={DESIRED_WORK_OPTIONS}
          value={data.desiredWorks}
          onChange={(desiredWorks) => patch({ desiredWorks })}
        />
        {data.desiredWorks.includes("その他") && (
          <div>
            <label className="field-label">その他の詳細</label>
            <input
              className="field-input"
              value={data.desiredWorksOtherNote}
              onChange={(e) => patch({ desiredWorksOtherNote: e.target.value })}
            />
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">SNS情報</h2>
        <SocialEditor value={data.social} onChange={(social) => patch({ social })} />
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 py-3 backdrop-blur md:pl-60">
        <div className="mx-auto flex max-w-3xl justify-end gap-3 px-4">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            キャンセル
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
