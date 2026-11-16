-- Clients get lines (user, 2026-11-16). What were clients become lines of a new client
-- (Company) that groups them into one ledger. Everything that was the client's stays on the line
-- (DID, rate, billing cycle, opening balance, its own invoices); payments belong to the client.
-- Additive: nothing is dropped. Every existing line gets its own client of the same name (same
-- id, so the backfill is a straight copy) and keeps its name as the line name, so its label and
-- everything keyed on it stay exactly as they were. Lines are grouped under one client afterwards.

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- One client per existing line
INSERT INTO "companies" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT "id", "companyName", "isActive", "createdAt", CURRENT_TIMESTAMP
FROM "clients";

-- Lines
ALTER TABLE "clients" ADD COLUMN "companyId" TEXT, ADD COLUMN "lineName" TEXT;
UPDATE "clients" SET "companyId" = "id", "lineName" = "companyName";
ALTER TABLE "clients" ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "lineName" SET NOT NULL;

-- Invoices stay on their line and go on the client's ledger; payments belong to the client
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_clientId_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_clientId_fkey";

ALTER TABLE "invoices" ADD COLUMN "companyId" TEXT;
UPDATE "invoices" SET "companyId" = "clientId";
ALTER TABLE "invoices" ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "clientId" DROP NOT NULL;

ALTER TABLE "payments" ADD COLUMN "companyId" TEXT;
UPDATE "payments" SET "companyId" = "clientId";
ALTER TABLE "payments" ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "clientId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");
CREATE INDEX "clients_companyId_idx" ON "clients"("companyId");
CREATE INDEX "invoices_companyId_status_idx" ON "invoices"("companyId", "status");
CREATE INDEX "payments_companyId_idx" ON "payments"("companyId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
