"use client";

import { useState } from "react";
import {
  GENDER_OPTIONS,
  PREFECTURE_OPTIONS,
  BANK_ACCOUNT_TYPE_OPTIONS,
  TALENT_STATUS_OPTIONS,
} from "@/lib/constants";
import type { TalentFormData } from "@/lib/talent-types";

export default function TalentForm({
  initialData,
  companies,
  showStatus,
  reviewNote,
  onSubmit,
  submitLabel,
}: {
  initialData: TalentFormData;
  companies: { id: string; name: string }[];
  showStatus?: boolean;
  reviewNote?: string | null;
  onSubmit: (input: TalentFormData) => Promise<void>;
  submitLabel: string;
}) {
  const [data, setData] = useState<TalentFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(fields: Partial<TalentFormData>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.lastName.trim() || !data.firstName.trim()) {
      setError("本名（姓・名）は必須です");
      return;
    }
    if (!data.companyId) {
      setError("所属事務所を選択してください");
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
        <h2 className="font-semibold">基本情報</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">本名（姓）</label>
            <input
              className="field-input"
              value={data.lastName}
              onChange={(e) => patch({ lastName: e.target.value })}
              placeholder="例：山田"
            />
          </div>
          <div>
            <label className="field-label">本名（名）</label>
            <input
              className="field-input"
              value={data.firstName}
              onChange={(e) => patch({ firstName: e.target.value })}
              placeholder="例：太郎"
            />
          </div>
          <div>
            <label className="field-label">読み方（姓）</label>
            <input
              className="field-input"
              value={data.lastNameKana}
              onChange={(e) => patch({ lastNameKana: e.target.value })}
              placeholder="例：やまだ"
            />
          </div>
          <div>
            <label className="field-label">読み方（名）</label>
            <input
              className="field-input"
              value={data.firstNameKana}
              onChange={(e) => patch({ firstNameKana: e.target.value })}
              placeholder="例：たろう"
            />
          </div>
          <div>
            <label className="field-label">性別</label>
            <select
              className="field-input"
              value={data.gender}
              onChange={(e) => patch({ gender: e.target.value })}
            >
              <option value="">選択してください</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">年齢</label>
            <input
              type="number"
              min={0}
              className="field-input"
              value={data.age}
              onChange={(e) => patch({ age: e.target.value })}
              placeholder="例：22"
            />
          </div>
          <div>
            <label className="field-label">所属事務所</label>
            <select
              className="field-input"
              value={data.companyId}
              onChange={(e) => patch({ companyId: e.target.value })}
            >
              <option value="">選択してください</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {showStatus && (
            <div>
              <label className="field-label">在籍状況</label>
              <select
                className="field-input"
                value={data.status}
                onChange={(e) => patch({ status: e.target.value })}
              >
                {TALENT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {showStatus && initialData.needsReview && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={data.needsReview}
              onChange={(e) => patch({ needsReview: e.target.checked })}
            />
            <span>
              要確認フラグ（移行データの氏名文字化けなどの疑いがあります）。内容を確認・修正したら
              チェックを外して保存してください。
              {reviewNote && <span className="mt-1 block text-xs text-amber-700">{reviewNote}</span>}
            </span>
          </label>
        )}
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">住所</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">郵便番号</label>
            <input
              className="field-input"
              value={data.postalCode}
              onChange={(e) => patch({ postalCode: e.target.value })}
              placeholder="例：150-0001"
            />
          </div>
          <div>
            <label className="field-label">都道府県</label>
            <select
              className="field-input"
              value={data.prefecture}
              onChange={(e) => patch({ prefecture: e.target.value })}
            >
              <option value="">選択してください</option>
              {PREFECTURE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">市区町村</label>
            <input
              className="field-input"
              value={data.city}
              onChange={(e) => patch({ city: e.target.value })}
              placeholder="例：渋谷区"
            />
          </div>
          <div>
            <label className="field-label">番地・建物名</label>
            <input
              className="field-input"
              value={data.addressLine}
              onChange={(e) => patch({ addressLine: e.target.value })}
              placeholder="例：神宮前1-2-3 〇〇マンション101"
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">銀行振込口座</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">銀行名</label>
            <input
              className="field-input"
              value={data.bankName}
              onChange={(e) => patch({ bankName: e.target.value })}
              placeholder="例：〇〇銀行"
            />
          </div>
          <div>
            <label className="field-label">支店名</label>
            <input
              className="field-input"
              value={data.branchName}
              onChange={(e) => patch({ branchName: e.target.value })}
              placeholder="例：渋谷支店"
            />
          </div>
          <div>
            <label className="field-label">口座種別</label>
            <select
              className="field-input"
              value={data.accountType}
              onChange={(e) => patch({ accountType: e.target.value })}
            >
              <option value="">選択してください</option>
              {BANK_ACCOUNT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">口座番号</label>
            <input
              className="field-input"
              value={data.accountNumber}
              onChange={(e) => patch({ accountNumber: e.target.value })}
              placeholder="例：1234567"
            />
          </div>
          <div>
            <label className="field-label">口座名義</label>
            <input
              className="field-input"
              value={data.accountHolder}
              onChange={(e) => patch({ accountHolder: e.target.value })}
              placeholder="例：ヤマダ タロウ"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
        {saving ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}
