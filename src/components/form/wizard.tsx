"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProgressBar from "@/components/form/progress-bar";
import TagInput from "@/components/form/tag-input";
import AchievementsEditor from "@/components/form/achievements-editor";
import SocialEditor from "@/components/form/social-editor";
import { HOBBY_OPTIONS, SKILL_OPTIONS, DESIRED_WORK_OPTIONS, SOCIAL_PLATFORMS } from "@/lib/constants";
import type { TalentFormData } from "@/lib/types";
import { saveTalentProfile } from "@/app/form/actions";

const TOTAL_STEPS = 8;

export default function Wizard({
  userId,
  initialData,
}: {
  userId: string;
  initialData: TalentFormData;
}) {
  const router = useRouter();
  const storageKey = useMemo(() => `talent-form-draft:${userId}`, [userId]);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<TalentFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as TalentFormData;
        setData(parsed);
      }
    } catch {
      // 無視して初期データのまま使用
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // ストレージが使えない場合は無視
    }
  }, [data, hydrated, storageKey]);

  function patch(fields: Partial<TalentFormData>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  function validateStep(current: number): string | null {
    if (current === 1) {
      if (!data.realName.trim()) return "本名を入力してください";
      if (!data.stageName.trim()) return "芸名・活動名を入力してください";
    }
    return null;
  }

  async function persistDraft(submit = false) {
    setSaving(true);
    setError(null);
    try {
      await saveTalentProfile(data, { submit });
    } catch (e) {
      setError("保存に失敗しました。通信環境をご確認のうえ、もう一度お試しください。");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await persistDraft(false);
    } catch {
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    try {
      await persistDraft(true);
    } catch {
      return;
    }
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // 無視
    }
    setStep(8);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAndPause() {
    try {
      await persistDraft(false);
    } catch {
      return;
    }
    router.push("/mypage");
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-6">
      {step <= 7 && <ProgressBar step={step} />}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold">基本情報</h2>
          <div>
            <label className="field-label">本名（管理者のみ閲覧可能）</label>
            <input
              className="field-input"
              value={data.realName}
              onChange={(e) => patch({ realName: e.target.value })}
              placeholder="例：山田 太郎"
            />
          </div>
          <div>
            <label className="field-label">芸名・活動名</label>
            <input
              className="field-input"
              value={data.stageName}
              onChange={(e) => patch({ stageName: e.target.value })}
              placeholder="例：酒月みるね"
            />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold">実績・経験</h2>
          <p className="text-sm text-gray-500">
            イベント出演、配信順位、SNS登録者数、企業案件経験など、複数登録できます。
          </p>
          <AchievementsEditor
            value={data.achievements}
            onChange={(achievements) => patch({ achievements })}
          />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-8">
          <h2 className="text-lg font-bold">趣味・特技</h2>
          <div>
            <label className="field-label">趣味（複数選択・自由入力可）</label>
            <TagInput
              options={HOBBY_OPTIONS}
              value={data.hobbies}
              onChange={(hobbies) => patch({ hobbies })}
              placeholder="その他の趣味を入力"
            />
          </div>
          <div>
            <label className="field-label">特技（複数選択・自由入力可）</label>
            <TagInput
              options={SKILL_OPTIONS}
              value={data.skills}
              onChange={(skills) => patch({ skills })}
              placeholder="その他の特技を入力"
            />
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold">夢・目標</h2>
          <div>
            <label className="field-label">今後の最終的な夢</label>
            <textarea
              className="field-textarea"
              rows={4}
              placeholder="例：大きなライブ会場でワンマンライブをしたい"
              value={data.finalDream}
              onChange={(e) => patch({ finalDream: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">半年後の目標</label>
            <textarea
              className="field-textarea"
              rows={4}
              placeholder="例：YouTube登録者1万人"
              value={data.halfYearGoal}
              onChange={(e) => patch({ halfYearGoal: e.target.value })}
            />
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold">してみたい仕事・案件</h2>
          <TagInput
            options={DESIRED_WORK_OPTIONS}
            value={data.desiredWorks}
            onChange={(desiredWorks) => patch({ desiredWorks })}
            placeholder="その他の案件を入力"
          />
          {data.desiredWorks.includes("その他") && (
            <div>
              <label className="field-label">その他の詳細</label>
              <input
                className="field-input"
                value={data.desiredWorksOtherNote}
                onChange={(e) => patch({ desiredWorksOtherNote: e.target.value })}
                placeholder="やってみたい仕事を具体的に"
              />
            </div>
          )}
        </section>
      )}

      {step === 6 && (
        <section className="space-y-5">
          <h2 className="text-lg font-bold">SNS情報</h2>
          <SocialEditor value={data.social} onChange={(social) => patch({ social })} />
        </section>
      )}

      {step === 7 && <ReviewStep data={data} onEdit={setStep} />}

      {step === 8 && (
        <section className="space-y-6 py-12 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-bold">送信が完了しました</h2>
          <p className="text-sm text-gray-600">
            ご登録ありがとうございました。内容はマイページからいつでも確認・編集できます。
          </p>
          <Link href="/mypage" className="btn-primary inline-flex">
            マイページへ
          </Link>
        </section>
      )}

      {step <= 7 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            {step > 1 && (
              <button type="button" onClick={goBack} className="btn-secondary flex-1" disabled={saving}>
                戻る
              </button>
            )}
            <button
              type="button"
              onClick={saveAndPause}
              className="flex-1 text-sm text-gray-500 underline"
              disabled={saving}
            >
              一時保存して中断
            </button>
            {step < 7 ? (
              <button type="button" onClick={goNext} className="btn-primary flex-1" disabled={saving}>
                {saving ? "保存中..." : "次へ"}
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} className="btn-primary flex-1" disabled={saving}>
                {saving ? "送信中..." : "送信する"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewStep({ data, onEdit }: { data: TalentFormData; onEdit: (step: number) => void }) {
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-bold">入力内容確認</h2>

      <ReviewBlock title="基本情報" onEdit={() => onEdit(1)}>
        <p>本名：{data.realName || "未入力"}</p>
        <p>芸名・活動名：{data.stageName || "未入力"}</p>
      </ReviewBlock>

      <ReviewBlock title="実績・経験" onEdit={() => onEdit(2)}>
        {data.achievements.filter((a) => a.content.trim()).length === 0 && <p>未入力</p>}
        <ul className="list-disc space-y-1 pl-5">
          {data.achievements
            .filter((a) => a.content.trim())
            .map((a, i) => (
              <li key={i}>
                {a.content}
                {a.category ? `（${a.category}）` : ""}
              </li>
            ))}
        </ul>
      </ReviewBlock>

      <ReviewBlock title="趣味・特技" onEdit={() => onEdit(3)}>
        <p>趣味：{data.hobbies.join("、") || "未入力"}</p>
        <p>特技：{data.skills.join("、") || "未入力"}</p>
      </ReviewBlock>

      <ReviewBlock title="夢・目標" onEdit={() => onEdit(4)}>
        <p>最終的な夢：{data.finalDream || "未入力"}</p>
        <p>半年後の目標：{data.halfYearGoal || "未入力"}</p>
      </ReviewBlock>

      <ReviewBlock title="してみたい仕事・案件" onEdit={() => onEdit(5)}>
        <p>
          {data.desiredWorks.join("、") || "未入力"}
          {data.desiredWorks.includes("その他") && data.desiredWorksOtherNote
            ? `（${data.desiredWorksOtherNote}）`
            : ""}
        </p>
      </ReviewBlock>

      <ReviewBlock title="SNS情報" onEdit={() => onEdit(6)}>
        {data.social
          .filter((s) => s.url.trim() || s.followers.trim())
          .map((s) => {
            const label = SOCIAL_PLATFORMS.find((p) => p.value === s.platform)?.label;
            return (
              <p key={s.platform}>
                {s.platform === "OTHER" ? s.label || "その他SNS" : label}：{s.url || "URL未入力"}
                {s.followers ? `（${s.followers}人）` : ""}
              </p>
            );
          })}
        {data.social.every((s) => !s.url.trim() && !s.followers.trim()) && <p>未入力</p>}
      </ReviewBlock>
    </section>
  );
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" onClick={onEdit} className="text-sm text-brand-600 underline">
          編集
        </button>
      </div>
      <div className="space-y-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}
