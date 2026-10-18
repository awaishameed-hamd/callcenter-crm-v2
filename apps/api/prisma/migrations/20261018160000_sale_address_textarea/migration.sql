-- The New Sale page draws every Textarea field of the sale form as a large box at the
-- bottom of its section. Address joins Comments as one, so the layout is driven by the
-- Sale Form settings in CRM Management instead of a field name in code. Admins can set
-- it back to Text there to make it a normal one-line input.
UPDATE "form_field_settings"
SET "fieldType" = 'textarea', "textareaRows" = 2
WHERE "formType" = 'sale' AND "fieldKey" = 'address' AND "fieldType" = 'text';
