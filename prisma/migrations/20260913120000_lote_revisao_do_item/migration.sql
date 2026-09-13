-- Pré-revisão C11-1 do PR 11 de "Marca simples, copy melhor" (12/09/2026): a
-- revisão do item de plano sob a qual a linha do lote foi RESERVADA (ao nascer)
-- e LIGADA (a cada peça). Com lote, o caminho do plano só produz peça nova, ou
-- job novo, quando ela é a revisão do item agora — a leva antiga repetida
-- depois de o item ganhar peça de revisão mais nova é recusada (409) em vez de
-- reproduzir a copy antiga.
-- Aditiva e idempotente, como a migration do lote; nenhum backfill: linha sem
-- revisão conta como desconhecida, nunca como igual.
ALTER TABLE "ItemDeLote" ADD COLUMN IF NOT EXISTS "planoRevisao" TEXT;
