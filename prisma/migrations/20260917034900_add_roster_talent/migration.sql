-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterTalent" (
    "id" TEXT NOT NULL,
    "talentNo" INTEGER NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNameKana" TEXT,
    "firstNameKana" TEXT,
    "gender" TEXT,
    "age" INTEGER,
    "companyId" TEXT NOT NULL,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "addressLine" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "legacyNo" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterTalent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "bankName" TEXT,
    "branchName" TEXT,
    "accountType" TEXT,
    "accountNumber" TEXT,
    "accountHolder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMonth" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PaymentMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "paymentMonthId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "amount" INTEGER,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RosterTalent_talentNo_key" ON "RosterTalent"("talentNo");

-- CreateIndex
CREATE UNIQUE INDEX "RosterTalent_companyId_legacyNo_key" ON "RosterTalent"("companyId", "legacyNo");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_talentId_key" ON "BankAccount"("talentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMonth_yearMonth_key" ON "PaymentMonth"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMonth_sortOrder_key" ON "PaymentMonth"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_talentId_paymentMonthId_key" ON "PaymentRecord"("talentId", "paymentMonthId");

-- AddForeignKey
ALTER TABLE "RosterTalent" ADD CONSTRAINT "RosterTalent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "RosterTalent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "RosterTalent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_paymentMonthId_fkey" FOREIGN KEY ("paymentMonthId") REFERENCES "PaymentMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

