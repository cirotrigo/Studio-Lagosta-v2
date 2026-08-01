-- Autocorreção geométrica de texto (text-autofix): flag por projeto e por
-- template, default ligada. Aditivo e idempotente — seguro contra produção.
ALTER TABLE "Project"  ADD COLUMN IF NOT EXISTS "textAutofixEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "textAutofixEnabled" BOOLEAN NOT NULL DEFAULT true;
