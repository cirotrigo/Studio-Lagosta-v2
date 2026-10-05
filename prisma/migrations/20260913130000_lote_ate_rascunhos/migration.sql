-- PR 12 de "Marca simples, copy melhor" (12/09/2026): do lote até os rascunhos.
-- O agendamento de cada item de lote passa a ser idempotente: a linha do item
-- guarda o post que ele criou (ou adotou), o hash do PEDIDO de agendamento e
-- quando os efeitos pós-commit terminaram. Aditiva e idempotente, como o 0_init
-- e a migration do PR 11; nenhum backfill (item de lote anterior a isto nunca
-- foi agendado por este caminho, e o vínculo não se inventa).
--
-- Renomeada de 20260913090000 para 20260913130000 (pré-revisão de b63edfb3):
-- o PR 11 entra ANTES e trouxe 20260913120000_lote_revisao_do_item; com o nome
-- antigo esta ordenava antes dela e a produção aplicaria fora da ordem do merge.
-- O SQL é o mesmo e idempotente — num banco onde o nome antigo já rodou, as
-- colunas e o índice existem e tudo aqui vira no-op.
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "postId" TEXT;
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "hashDoAgendamento" TEXT;
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "agendadoEm" TIMESTAMP(3);
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "efeitosDoAgendamentoEm" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ItemDeLote_postId_idx"
  ON "ItemDeLote"("postId");
