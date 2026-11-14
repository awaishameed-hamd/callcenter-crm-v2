-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_createdById_fkey";

-- DropIndex
DROP INDEX "invoices_clientId_billingPeriodStart_billingPeriodEnd_key";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "cycleNotifiedThrough" DATE,
ADD COLUMN     "openingBalanceDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'WIRE',
    "reference" TEXT,
    "proofUrl" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "overpaymentType" TEXT NOT NULL DEFAULT 'ADVANCE',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentNumber_key" ON "payments"("paymentNumber");

-- CreateIndex
CREATE INDEX "payments_clientId_idx" ON "payments"("clientId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_invoiceId_key" ON "payment_allocations"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "invoices_clientId_billingPeriodStart_billingPeriodEnd_idx" ON "invoices"("clientId", "billingPeriodStart", "billingPeriodEnd");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
