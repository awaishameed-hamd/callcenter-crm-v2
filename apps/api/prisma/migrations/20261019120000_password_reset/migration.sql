-- Forgot password by emailed code (same flow as argroup). The reset columns already came with the
-- first migration (copied from argroup's schema); IF NOT EXISTS keeps this safe either way.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "resetOtpHash"  TEXT,
  ADD COLUMN IF NOT EXISTS "resetOtpExp"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resetOtpTries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "resetToken"    TEXT,
  ADD COLUMN IF NOT EXISTS "resetTokenExp" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_resetToken_key" ON "users"("resetToken");

-- Email becomes required on the Create User form, so every new account can sign in with it and
-- reset its password
UPDATE "form_field_settings" SET "isRequired" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "formType" = 'user' AND "fieldKey" = 'email';
