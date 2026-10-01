"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PROJECT_ACTIVITY_OPTIONS, PROJECT_STATUS_OPTIONS } from "@/lib/constants";
import type { ProjectFormInput } from "@/app/admin/(dashboard)/projects/actions";

export default function ProjectForm({
  initialData,
  showStatus,
  onSubmit,
  submitLabel,
}: {
  initialData: ProjectFormInput;
  showStatus?: boolean;
  onSubmit: (input: ProjectFormInput) => Promise<void>;
  submitLabel: string;
}) {
  const [data, setData] = useState<ProjectFormInput>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(fields: Partial<ProjectFormInput>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  function toggleActivity(activity: string) {
    patch({
      desiredActivities: data.desiredActivities.includes(activity)
        ? data.desiredActivities.filter((a) => a !== activity)
        : [...data.desiredActivities, activity],
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.name.trim() || !data.description.trim() || !data.genre.trim()) {
      setError("案件名・案件内容・案件ジャンルは必須です");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card space-y-4">
        <div>
          <label className="field-label">案件名</label>
          <input
            className="field-input"
            value={data.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="例：〇〇ゲームPR案件"
          />
        </div>
        <div>
          <label className="field-label">案件内容</label>
          <textarea
            className="field-textarea"
            rows={3}
            value={data.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="例：新作スマートフォンゲームをプレイして、YouTubeで紹介してもらう案件"
          />
        </div>
        <div>
          <label className="field-label">案件ジャンル</label>
          <input
            className="field-input"
            value={data.genre}
            onChange={(e) => patch({ genre: e.target.value })}
            placeholder="例：ゲーム"
          />
        </div>
        <div>
          <label className="field-label">希望する活動</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_ACTIVITY_OPTIONS.map((activity) => (
              <button
                type="button"
                key={activity}
                onClick={() => toggleActivity(activity)}
                className={cn(
                  "chip",
                  data.desiredActivities.includes(activity) ? "chip-selected" : "chip-unselected"
                )}
              >
                {activity}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="field-label">求める人物像</label>
          <textarea
            className="field-textarea"
            rows={2}
            value={data.idealPersona}
            onChange={(e) => patch({ idealPersona: e.target.value })}
            placeholder="例：ゲームが好きで、明るく商品を紹介できる人"
          />
        </div>
        <div>
          <label className="field-label">必須条件</label>
          <textarea
            className="field-textarea"
            rows={2}
            value={data.requiredConditions}
            onChange={(e) => patch({ requiredConditions: e.target.value })}
            placeholder="例：ゲーム配信経験"
          />
        </div>
        <div>
          <label className="field-label">その他条件</label>
          <textarea
            className="field-textarea"
            rows={2}
            value={data.otherConditions}
            onChange={(e) => patch({ otherConditions: e.target.value })}
            placeholder="例：過去にゲーム案件経験があると望ましい"
          />
        </div>

        {showStatus && (
          <div>
            <label className="field-label">ステータス</label>
            <select
              className="field-input"
              value={data.status}
              onChange={(e) => patch({ status: e.target.value })}
            >
              {PROJECT_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
        {saving ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}
