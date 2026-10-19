-- Father Name on users, and the Create User form order the user asked for (2026-10-19):
-- Personal Information rows: First | Middle | Last, Father Name | Display Name | Phone,
-- Date of Birth | Date of Joining | Experience. (Email and Department sit in the Account block.)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fatherName" TEXT;

UPDATE "form_field_settings" SET "sortOrder" = "sortOrder" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "formType" = 'user' AND "sortOrder" >= 4
  AND NOT EXISTS (SELECT 1 FROM "form_field_settings" WHERE "formType" = 'user' AND "fieldKey" = 'father_name');

INSERT INTO "form_field_settings" ("id", "formType", "fieldKey", "label", "placeholder", "isVisible", "isRequired", "fieldType", "sortOrder", "isCore", "section", "colSpan", "textareaRows", "createdAt", "updatedAt")
VALUES ('ffs_user_father_name', 'user', 'father_name', 'Father Name', 'Father''s name', true, false, 'text', 4, false, 'Personal Information', 'third', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("formType", "fieldKey") DO NOTHING;

UPDATE "form_field_settings" SET "colSpan" = 'third', "updatedAt" = CURRENT_TIMESTAMP
WHERE "formType" = 'user' AND "fieldKey" IN ('phone', 'experience');
