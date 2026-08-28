"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, type RegisterFormState } from "./actions";

const SUBMITTER_SUGGESTIONS = ["大内", "CS", "TS", "営業", "マネージャー"];
const initialRegisterFormState: RegisterFormState = { status: "idle" };

function fieldErrorClass(state: RegisterFormState, field: string) {
  return state.status === "error" && state.field === field
    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
    : "border-gray-300 focus:border-brand-500 focus:ring-brand-100";
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-4 text-lg font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "登録中..." : "登録する"}
    </button>
  );
}

export default function RegisterForm() {
  const [state, formAction] = useFormState(
    registerAction,
    initialRegisterFormState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          REALITY新規登録者 登録フォーム
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          新規登録者の情報を入力し、「登録する」を押してください。
        </p>

        {state.status === "success" && (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {state.message}
          </div>
        )}
        {state.status === "error" && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {state.message}
          </div>
        )}

        <form ref={formRef} action={formAction} className="mt-6 space-y-5">
          <div>
            <label htmlFor="submitter" className="block text-sm font-medium text-gray-700">
              提出内容(誰からの提出か) <span className="text-red-500">*</span>
            </label>
            <input
              id="submitter"
              name="submitter"
              list="submitter-suggestions"
              autoComplete="off"
              placeholder="例: 大内 / CS / TS / 営業 / マネージャー名"
              className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "submitter")}`}
            />
            <datalist id="submitter-suggestions">
              {SUBMITTER_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="realityUrl" className="block text-sm font-medium text-gray-700">
              REALITY URL <span className="text-red-500">*</span>
            </label>
            <input
              id="realityUrl"
              name="realityUrl"
              type="text"
              inputMode="url"
              placeholder="https://reality.app/profile/xxxxx"
              className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "realityUrl")}`}
            />
          </div>

          <div>
            <label htmlFor="realityId" className="block text-sm font-medium text-gray-700">
              REALITY ID <span className="text-red-500">*</span>
            </label>
            <input
              id="realityId"
              name="realityId"
              type="text"
              autoComplete="off"
              placeholder="例: xxxxx"
              className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "realityId")}`}
            />
          </div>

          <div>
            <label htmlFor="stageName" className="block text-sm font-medium text-gray-700">
              活動名 <span className="text-red-500">*</span>
            </label>
            <input
              id="stageName"
              name="stageName"
              type="text"
              placeholder="例: ○○ちゃん"
              className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "stageName")}`}
            />
          </div>

          <div>
            <label htmlFor="realName" className="block text-sm font-medium text-gray-700">
              本名 <span className="text-red-500">*</span>
            </label>
            <input
              id="realName"
              name="realName"
              type="text"
              placeholder="例: 山田 太郎"
              className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "realName")}`}
            />
            <p className="mt-1 text-xs text-gray-400">
              ※ 本名は管理画面でのみ表示され、一般には公開されません。
            </p>
          </div>

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
