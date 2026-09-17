"use client";

import type { BankAccount, RosterTalent } from "@prisma/client";
import TalentRosterForm from "@/components/admin/talent-roster-form";
import type { TalentRosterFormData } from "@/lib/roster-types";
import { updateTalent } from "../../actions";

export default function EditTalentForm({
  talent,
  companies,
}: {
  talent: RosterTalent & { bankAccount: BankAccount | null };
  companies: { id: string; name: string }[];
}) {
  const initialData: TalentRosterFormData = {
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
    <TalentRosterForm
      initialData={initialData}
      companies={companies}
      showStatus
      reviewNote={talent.reviewNote}
      onSubmit={(input) => updateTalent(talent.id, input)}
      submitLabel="保存する"
    />
  );
}
