-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('REVENUE_SHARE', 'RENTAL');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "settlementId" TEXT;

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "studioPercent" DECIMAL(5,2),
    "validFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "studioShare" DECIMAL(12,2) NOT NULL,
    "collectedByTeacher" DECIMAL(12,2) NOT NULL,
    "netToTeacher" DECIMAL(12,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agreement_orgId_teacherId_validFrom_idx" ON "Agreement"("orgId", "teacherId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_teacherId_validFrom_key" ON "Agreement"("teacherId", "validFrom");

-- CreateIndex
CREATE INDEX "Settlement_orgId_period_idx" ON "Settlement"("orgId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_teacherId_period_key" ON "Settlement"("teacherId", "period");

-- CreateIndex
CREATE INDEX "Payment_settlementId_idx" ON "Payment"("settlementId");

-- CreateIndex
CREATE INDEX "Payment_receivedById_idx" ON "Payment"("receivedById");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
