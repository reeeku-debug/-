"use client";

import TalentForm from "@/components/talents/talent-form";
import { emptyTalentFormData } from "@/lib/talent-types";
import { createTalent } from "../actions";

export default function NewTalentForm({ companies }: { companies: { id: string; name: string }[] }) {
  return (
    <TalentForm
      initialData={emptyTalentFormData()}
      companies={companies}
      onSubmit={createTalent}
      submitLabel="登録する"
    />
  );
}
