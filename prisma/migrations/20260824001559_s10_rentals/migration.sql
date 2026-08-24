-- CreateEnum
CREATE TYPE "RentalPeriod" AS ENUM ('MONTHLY', 'PER_SESSION', 'PER_HOUR');

-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "rentalAmount" DECIMAL(12,2),
ADD COLUMN     "rentalPeriod" "RentalPeriod";

-- CreateTable
CREATE TABLE "RentalCharge" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" DATE,
    "method" "PayMethod",
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "minutesTotal" INTEGER NOT NULL DEFAULT 0,
    "unspacedSessions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalCharge_orgId_period_idx" ON "RentalCharge"("orgId", "period");

-- CreateIndex
CREATE INDEX "RentalCharge_orgId_status_idx" ON "RentalCharge"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RentalCharge_teacherId_period_key" ON "RentalCharge"("teacherId", "period");

-- AddForeignKey
ALTER TABLE "RentalCharge" ADD CONSTRAINT "RentalCharge_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalCharge" ADD CONSTRAINT "RentalCharge_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
