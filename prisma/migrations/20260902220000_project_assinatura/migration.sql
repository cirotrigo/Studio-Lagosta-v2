-- Os números da assinatura de composição do projeto (editor-como-usina, F1).
-- Aditiva e idempotente: nada muda para quem não usa o compositor.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assinatura" JSONB;
