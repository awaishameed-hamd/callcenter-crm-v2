-- CreateTable
CREATE TABLE "verticals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOther" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verticals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verticals_name_key" ON "verticals"("name");

-- Starting list: the four verticals that were fixed in code until now
INSERT INTO "verticals" ("id", "name", "color", "sortOrder", "isActive", "isOther", "updatedAt") VALUES
  ('vert_medicare',      'Medicare',      '#1E8496', 1, true, false, CURRENT_TIMESTAMP),
  ('vert_final_expense', 'Final Expense', '#1565C0', 2, true, false, CURRENT_TIMESTAMP),
  ('vert_aca',           'ACA',           '#3A6B3A', 3, true, false, CURRENT_TIMESTAMP),
  ('vert_other',         'Other',         '#C25A1F', 99, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Any other name already stored on a sale, client or DID becomes a vertical too, so no record is orphaned
INSERT INTO "verticals" ("id", "name", "color", "sortOrder", "isActive", "isOther", "updatedAt")
SELECT 'vert_' || md5(v.name), v.name, '#7B2D8E', 50, true, false, CURRENT_TIMESTAMP
FROM (
  SELECT "verticalType" AS name FROM "customers" WHERE "verticalType" IS NOT NULL AND "verticalType" <> ''
  UNION SELECT "campaign" FROM "clients" WHERE "campaign" IS NOT NULL AND "campaign" <> ''
  UNION SELECT "campaign" FROM "dids"
) v
ON CONFLICT ("name") DO NOTHING;
