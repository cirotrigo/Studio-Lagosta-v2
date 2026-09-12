-- PR 12 de "Marca simples, copy melhor" (12/09/2026): do lote até os rascunhos.
-- O agendamento de cada item de lote passa a ser idempotente: a linha do item
-- guarda o post que ele criou (ou adotou), o hash do PEDIDO de agendamento e
-- quando os efeitos pós-commit terminaram. Aditiva e idempotente, como o 0_init
-- e a migration do PR 11; nenhum backfill (item de lote anterior a isto nunca
-- foi agendado por este caminho, e o vínculo não se inventa).
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "postId" TEXT;
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "hashDoAgendamento" TEXT;
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "agendadoEm" TIMESTAMP(3);
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "efeitosDoAgendamentoEm" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ItemDeLote_postId_idx"
  ON "ItemDeLote"("postId");
