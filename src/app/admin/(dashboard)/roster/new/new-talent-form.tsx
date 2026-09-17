"use client";

import TalentRosterForm from "@/components/admin/talent-roster-form";
import { emptyTalentRosterFormData } from "@/lib/roster-types";
import { createTalent } from "../actions";

export default function NewTalentForm({ companies }: { companies: { id: string; name: string }[] }) {
  return (
    <TalentRosterForm
      initialData={emptyTalentRosterFormData()}
      companies={companies}
      onSubmit={createTalent}
      submitLabel="登録する"
    />
  );
}
