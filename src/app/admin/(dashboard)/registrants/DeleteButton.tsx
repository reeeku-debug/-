"use client";

import { useFormStatus } from "react-dom";
import { deleteRegistrantAction } from "./actions";

function SubmitDeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-medium text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "削除中..." : "削除"}
    </button>
  );
}

export default function DeleteButton({
  id,
  stageName,
}: {
  id: string;
  stageName: string;
}) {
  const boundDeleteAction = deleteRegistrantAction.bind(null, id);

  return (
    <form
      action={boundDeleteAction}
      onSubmit={(e) => {
        if (!confirm(`本当に削除しますか?\n(${stageName})`)) {
          e.preventDefault();
        }
      }}
    >
      <SubmitDeleteButton />
    </form>
  );
}
