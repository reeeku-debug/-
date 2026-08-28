"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { Registrant } from "@prisma/client";
import { updateRegistrantAction, type EditFormState } from "../../actions";

const initialEditFormState: EditFormState = { status: "idle" };

function fieldErrorClass(state: EditFormState, field: string) {
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
      {pending ? "保存中..." : "保存する"}
    </button>
  );
}

export default function EditForm({ registrant }: { registrant: Registrant }) {
  const boundAction = updateRegistrantAction.bind(null, registrant.id);
  const [state, formAction] = useFormState(boundAction, initialEditFormState);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      {state.status === "error" && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-5">
        <div>
          <label htmlFor="submitter" className="block text-sm font-medium text-gray-700">
            提出内容 <span className="text-red-500">*</span>
          </label>
          <input
            id="submitter"
            name="submitter"
            defaultValue={registrant.submitter}
            className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "submitter")}`}
          />
        </div>

        <div>
          <label htmlFor="realityUrl" className="block text-sm font-medium text-gray-700">
            REALITY URL <span className="text-red-500">*</span>
          </label>
          <input
            id="realityUrl"
            name="realityUrl"
            defaultValue={registrant.realityUrl}
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
            defaultValue={registrant.realityId}
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
            defaultValue={registrant.stageName}
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
            defaultValue={registrant.realName}
            className={`mt-1 block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 ${fieldErrorClass(state, "realName")}`}
          />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}
