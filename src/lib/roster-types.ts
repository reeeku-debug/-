export interface TalentRosterFormData {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  gender: string;
  companyId: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  status: string;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

export function emptyTalentRosterFormData(defaultCompanyId = ""): TalentRosterFormData {
  return {
    lastName: "",
    firstName: "",
    lastNameKana: "",
    firstNameKana: "",
    gender: "",
    companyId: defaultCompanyId,
    postalCode: "",
    prefecture: "",
    city: "",
    addressLine: "",
    status: "ACTIVE",
    bankName: "",
    branchName: "",
    accountType: "",
    accountNumber: "",
    accountHolder: "",
  };
}
