"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export default function TagInput({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [custom, setCustom] = useState("");
  const customTags = value.filter((v) => !options.includes(v));

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  }

  function addCustom() {
    const trimmed = custom.trim();
    if (!trimmed || value.includes(trimmed)) {
      setCustom("");
      return;
    }
    onChange([...value, trimmed]);
    setCustom("");
  }

  function removeCustom(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => toggle(option)}
            className={cn("chip", value.includes(option) ? "chip-selected" : "chip-unselected")}
          >
            {option}
          </button>
        ))}
      </div>

      {customTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {customTags.map((tag) => (
            <span key={tag} className="chip chip-selected">
              {tag}
              <button
                type="button"
                onClick={() => removeCustom(tag)}
                className="ml-1 text-white/80 hover:text-white"
                aria-label={`${tag}を削除`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className="field-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={placeholder ?? "自由入力で追加"}
        />
        <button type="button" onClick={addCustom} className="btn-secondary whitespace-nowrap">
          追加
        </button>
      </div>
    </div>
  );
}
