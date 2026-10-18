-- Business change (2026-10-18): Auto replaces ACA for now (ACA can be added back under
-- Verticals), and each vertical starts with 10 DIDs instead of 20 (more can be added in
-- the DID Pool).

-- ACA becomes Auto, but only while no sale or client uses ACA; its DIDs move with it
UPDATE "verticals" SET "name" = 'Auto', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'ACA'
  AND NOT EXISTS (SELECT 1 FROM "verticals" WHERE "name" = 'Auto')
  AND NOT EXISTS (SELECT 1 FROM "customers" WHERE "verticalType" = 'ACA')
  AND NOT EXISTS (SELECT 1 FROM "clients" WHERE "campaign" = 'ACA');

UPDATE "dids" SET "campaign" = 'Auto', "updatedAt" = CURRENT_TIMESTAMP
WHERE "campaign" = 'ACA' AND EXISTS (SELECT 1 FROM "verticals" WHERE "name" = 'Auto')
  AND NOT EXISTS (SELECT 1 FROM "verticals" WHERE "name" = 'ACA');

-- The Department list (and the stored Vertical Type / Campaign options) follow suit
UPDATE "users" SET "department" = 'Auto' WHERE "department" = 'ACA';
UPDATE "form_field_settings" SET "options" = replace("options"::text, '"ACA"', '"Auto"')::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "options"::text LIKE '%"ACA"%' AND "options"::text NOT LIKE '%"Auto"%';

-- Keep DIDs 1 to 10 of each prefix; remove 11 and up unless a client holds it or a sale recorded it
DELETE FROM "dids" d
WHERE substring(d."didCode" FROM '[0-9]+$') IS NOT NULL
  AND substring(d."didCode" FROM '[0-9]+$')::int > 10
  AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c."didCode" = d."didCode")
  AND NOT EXISTS (SELECT 1 FROM "customers" s WHERE s."saleDidCode" = d."didCode");
