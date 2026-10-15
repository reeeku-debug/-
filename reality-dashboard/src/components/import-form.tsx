"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { importAction, type ImportState } from "@/app/(dashboard)/actions";
import { cn } from "@/lib/utils";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary px-5 py-2 text-sm">
      {pending ? "取り込み中…（30秒ほどかかります）" : "取り込む"}
    </button>
  );
}

export default function ImportForm() {
  const [state, action] = useFormState<ImportState, FormData>(importAction, { results: [], error: null });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="space-y-4">
        <label className="block text-sm">
          <span className="field-label">REALITY の配信レポートCSV（複数選べます）</span>
          <input
            type="file"
            name="files"
            multiple
            accept=".csv,.tsv,.txt,text/csv"
            required
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">
            対象月（ふつうは空欄でOK。ファイル名が streamer_開始日_終了日.csv でないときだけ選ぶと、その月の1日〜末日分として取り込みます）
          </span>
          <input type="month" name="month" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5" />
        </label>
        <Submit />
      </form>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.results.length > 0 && (
        <ul className="space-y-2">
          {state.results.map((r, i) => (
            <li
              key={i}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                r.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              {r.name && <span className="mr-2 font-semibold break-all">{r.name}</span>}
              {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
