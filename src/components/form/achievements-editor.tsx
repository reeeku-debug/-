"use client";

import type { AchievementInput } from "@/lib/types";
import { ACHIEVEMENT_CATEGORY_OPTIONS } from "@/lib/constants";

export default function AchievementsEditor({
  value,
  onChange,
}: {
  value: AchievementInput[];
  onChange: (next: AchievementInput[]) => void;
}) {
  function update(index: number, patch: Partial<AchievementInput>) {
    onChange(value.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function addRow() {
    onChange([...value, { content: "", category: "", yearMonth: "" }]);
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {value.map((achievement, index) => (
        <div key={index} className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500">実績 {index + 1}</span>
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="text-sm text-red-500 underline"
              >
                削除
              </button>
            )}
          </div>
          <div>
            <label className="field-label">実績内容</label>
            <textarea
              className="field-textarea"
              rows={2}
              placeholder="例：配信イベント〇〇位、YouTube登録者〇〇人、企業案件出演 など"
              value={achievement.content}
              onChange={(e) => update(index, { content: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">カテゴリ</label>
              <select
                className="field-input"
                value={achievement.category}
                onChange={(e) => update(index, { category: e.target.value })}
              >
                <option value="">選択してください</option>
                {ACHIEVEMENT_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">年月（任意）</label>
              <input
                className="field-input"
                placeholder="例：2025-03"
                value={achievement.yearMonth}
                onChange={(e) => update(index, { yearMonth: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}

      <button type="button" onClick={addRow} className="btn-secondary w-full">
        + 実績を追加する
      </button>
    </div>
  );
}
