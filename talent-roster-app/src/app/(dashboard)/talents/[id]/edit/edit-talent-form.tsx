"use client";

import type { BankAccount, Talent } from "@prisma/client";
import TalentForm from "@/components/talents/talent-form";
import type { TalentFormData } from "@/lib/talent-types";
import { updateTalent } from "../../actions";

export default function EditTalentForm({
  talent,
  companies,
}: {
  talent: Talent & { bankAccount: BankAccount | null };
  companies: { id: string; name: string }[];
}) {
  const initialData: TalentFormData = {
    lastName: talent.lastName,
    firstName: talent.firstName,
    lastNameKana: talent.lastNameKana ?? "",
    firstNameKana: talent.firstNameKana ?? "",
    gender: talent.gender ?? "",
    age: talent.age != null ? String(talent.age) : "",
    companyId: talent.companyId,
    postalCode: talent.postalCode ?? "",
    prefecture: talent.prefecture ?? "",
    city: talent.city ?? "",
    addressLine: talent.addressLine ?? "",
    status: talent.status,
    bankName: talent.bankAccount?.bankName ?? "",
    branchName: talent.bankAccount?.branchName ?? "",
    accountType: talent.bankAccount?.accountType ?? "",
    accountNumber: talent.bankAccount?.accountNumber ?? "",
    accountHolder: talent.bankAccount?.accountHolder ?? "",
    needsReview: talent.needsReview,
  };

  return (
    <TalentForm
      initialData={initialData}
      companies={companies}
      showStatus
      reviewNote={talent.reviewNote}
      onSubmit={(input) => updateTalent(talent.id, input)}
      submitLabel="保存する"
    />
  );
}
