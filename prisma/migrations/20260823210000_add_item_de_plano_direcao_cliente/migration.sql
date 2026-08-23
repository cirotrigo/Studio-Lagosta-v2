-- O item de plano passa a carregar o BRIEFING inteiro da geração por IA.
--
-- Até aqui "direção adicional" e "ajuste da foto" da bancada ficavam só no
-- navegador de quem editou, e o `executar-plano` mandava o NOME DO TEMA como
-- pedido. Com as colunas, o que a equipe escreve no card (ou o que o chat
-- propõe) viaja com o item e chega ao modelo — e o mesmo item pode nascer já
-- com o cliente citado, cuja logomarca é composta na peça (co-branding da
-- Lagosta Criativa com os restaurantes que atende).
--
-- Idempotente (IF NOT EXISTS), no mesmo molde do 0_init: o banco de produção
-- tem drift histórico e a migration precisa ser um no-op onde a coluna já exista.

ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "direcao" TEXT;
ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "ajusteDaFoto" TEXT;
ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "clienteProjectId" INTEGER;
