"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importCsvAction, type ImportState } from "@/app/(dashboard)/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary px-5 py-2 text-sm">
      {pending ? "取り込み中…" : "データを取り込む"}
    </button>
  );
}

const n = (v: number) => v.toLocaleString("ja-JP");

export default function CsvImportForm({ apps, writable }: { apps: Array<{ id: string; label: string }>; writable: boolean }) {
  const [state, action] = useFormState<ImportState, FormData>(importCsvAction, { result: null, error: null });
  const r = state.result;

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="field-label">アプリ</span>
            <select name="app" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" required>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="field-label">CSVファイル</span>
            <input
              type="file"
              name="file"
              accept=".csv,.tsv,.txt,text/csv"
              required
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-gray-600">文字コード</span>
            <select name="encoding" className="rounded-lg border border-gray-300 bg-white px-2 py-1">
              <option value="auto">自動判定（UTF-8 / Shift_JIS）</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="addTalents" defaultChecked />
            未登録のタレントを TALENTS シートに追加
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="dryRun" />
            プレビューのみ（書き込まない）
          </label>
        </div>
        <Submit />
        {!writable && <p className="text-sm text-red-600">現在のデータソースは書き込みできません（プレビューのみ可能）</p>}
      </form>

      {state.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>}

      {r && (
        <div className={`rounded-lg border px-4 py-4 text-sm ${r.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          {r.ok ? (
            <p className="text-base font-semibold text-gray-900">
              {r.dryRun
                ? `プレビュー：${n(r.newRecords + r.updatedRecords)}件のデータが取り込まれます（まだ書き込んでいません）`
                : `${n(r.newRecords + r.updatedRecords)}件のデータを取り込みました。`}
            </p>
          ) : (
            <p className="font-semibold text-red-700">取り込みできませんでした</p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
            <div><dt className="text-xs text-gray-500">ファイル</dt><dd className="truncate">{r.fileName}</dd></div>
            <div><dt className="text-xs text-gray-500">取込先</dt><dd>{r.sheet}</dd></div>
            <div><dt className="text-xs text-gray-500">CSV行数</dt><dd>{n(r.fileRows)}行</dd></div>
            <div><dt className="text-xs text-gray-500">対象期間</dt><dd>{r.period ? `${r.period.from} 〜 ${r.period.to}` : "-"}</dd></div>
            <div><dt className="text-xs text-gray-500">新規データ</dt><dd>{n(r.newRecords)}件</dd></div>
            <div><dt className="text-xs text-gray-500">更新（修正版で上書き）</dt><dd>{n(r.updatedRecords)}件</dd></div>
            <div><dt className="text-xs text-gray-500">重複のためスキップ</dt><dd>{n(r.duplicateRecords)}件</dd></div>
            <div><dt className="text-xs text-gray-500">読み取れなかった行</dt><dd>{n(r.invalidRows)}行</dd></div>
            <div><dt className="text-xs text-gray-500">シートへ追記した行</dt><dd>{n(r.appendedRows)}行</dd></div>
            <div><dt className="text-xs text-gray-500">追加したタレント</dt><dd>{n(r.addedTalents)}名</dd></div>
          </dl>
          {r.errors.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-red-700">
              {r.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {r.sampleErrors.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-amber-800">
              {r.sampleErrors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {r.mapping && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-gray-600">カラムの対応を確認</summary>
              <table className="mt-2 text-xs">
                <tbody>
                  {r.mapping.fields.map((f) => (
                    <tr key={f.field}>
                      <td className="pr-4 text-gray-500">{f.label}{f.required && " *"}</td>
                      <td className={f.matchedColumn ? "" : f.required ? "text-red-600" : "text-gray-400"}>
                        {f.matchedColumn ?? "（該当列なし）"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-gray-500">CSVの列：{r.mapping.headers.join(" / ")}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
