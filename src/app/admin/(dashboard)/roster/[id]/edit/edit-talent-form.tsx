"use client";

import type { BankAccount, Talent } from "@prisma/client";
import TalentRosterForm from "@/components/admin/talent-roster-form";
import type { TalentRosterFormData } from "@/lib/roster-types";
import { updateTalent } from "../../actions";

export default function EditTalentForm({
  talent,
  companies,
}: {
  talent: Talent & { bankAccount: BankAccount | null };
  companies: { id: string; name: string }[];
}) {
  const initialData: TalentRosterFormData = {
    lastName: talent.lastName,
    firstName: talent.firstName,
    lastNameKana: talent.lastNameKana ?? "",
    firstNameKana: talent.firstNameKana ?? "",
    gender: talent.gender ?? "",
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
  };

  return (
    <TalentRosterForm
      initialData={initialData}
      companies={companies}
      showStatus
      onSubmit={(input) => updateTalent(talent.id, input)}
      submitLabel="保存する"
    />
  );
}
