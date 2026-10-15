"use client";

import type { SocialInput } from "@/lib/types";
import { SOCIAL_PLATFORMS } from "@/lib/constants";

export default function SocialEditor({
  value,
  onChange,
}: {
  value: SocialInput[];
  onChange: (next: SocialInput[]) => void;
}) {
  function update(index: number, patch: Partial<SocialInput>) {
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-4">
      {value.map((account, index) => {
        const meta = SOCIAL_PLATFORMS.find((p) => p.value === account.platform);
        return (
          <div key={account.platform} className="card space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">{meta?.label ?? account.platform}</span>
            </div>
            {account.platform === "OTHER" && (
              <div>
                <label className="field-label">SNS名</label>
                <input
                  className="field-input"
                  placeholder="例：REALITY、17LIVE など"
                  value={account.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">URL</label>
                <input
                  className="field-input"
                  type="url"
                  placeholder="https://"
                  value={account.url}
                  onChange={(e) => update(index, { url: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">フォロワー数（任意）</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="例：10000"
                  value={account.followers}
                  onChange={(e) => update(index, { followers: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-gray-500">
        ※ 現時点では手入力です。将来的にSNS情報・フォロワー数の自動取得に対応予定です。
      </p>
    </div>
  );
}
